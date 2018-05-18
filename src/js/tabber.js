/**
Copyright 2018 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * @fileoverview
 * tabber.js - Provides the main Tabber logic for managing Chrome tabs on
 * behalf of a Google user.
 *
 * Notes:
 *  - This script is intended to run in the background page.
 *  - Herein the term "browser session" does not refer to a Chrome "sessions",
 *    which is just a single tab or single-tabbed Window. Instead, it refers to
 *    the set of tabs which comprise the state of a browser instance.
 *
 * Overview
 * ========
 * Tabber helps keep the local browser session in sync with a remote session
 * saved online. A session has a list of open tabs, a changestamp, and a
 * human-friendly description, which will (eventually) allow the user to
 * select/navigate among multiple sessions.
 *
 * Basic UI
 * ========
 * Tabber has a status icon (Chrome browse action icon) and a popup page.
 *
 * The popup page allows the user to perform a few basic Tabber tasks:
 *    - Set the operational mode (explained below)
 *    - Perform a manual Save or Restore
 *
 * The popup also shows a summary of the saved session, including number of
 * tabs, and whether it is newer or older than the local one.
 *
 * The status icon shows status as:
 *    RED: there is some problem communicating with Chrome or Google
 *    YELLOW: A sync is needed or is pending.
 *    GREEN: Current session is properly sync'd with remote
 *
 * Automatic vs. Manual Operation
 * ==============================
 * In order to make sync useful yet non-invasive, there are several modes
 * of operation that control when/if Tabber automatically tries to sync the
 * browser and session states.
 *
 * MANUAL: No session sync is performed unless user requests it from the UI.
 * AUTOSTART: Browser is sync'd to saved session only at Tabber/Browser start.
 * AUTOSAVE: Like AUTOSTART, but browser changes are automatically saved.
 * AUTOSYNC: Like AUTOSAVE, but the browser is automatically sync'd to any
 *           remote changes made to the saved session (from another machine).
 *
 * Internal Operation
 * ==================
 * Tabber saves or restores the Chrome tabs using the Chrome.storage.sync API,
 * which stores extension data in the user's Google account. We don't try to
 * sync every move the user makes (i.e. scrolling, zooming, etc.), but we do
 * keep track of each tab's url, index, title, and active status.
 * When comparing the browser to a saved session, there are three possible
 * levels of severity for differences, with Tabber only reporting the most
 * severe difference:
 *
 * Major: A major difference is indicated to the user, and provokes an
 *        auto-sync operation. An example of a major difference would be
 *        mismatched tab urls.
 * Minor: A minor" difference is not indicated to the user, but still provokes
 *        an auto-sync. These are differences that may be visible, but not
 *        substantial. An example of a minor difference would be a mismatch
 *        of active tabs.
 *
 * Auto-save operations are done in a time-delayed fashion to avoid
 * rapid/repeated online updates. Tabber will wait for at least a few seconds
 * of inactivity before initiating any compare or sync operations.
 *
 */

goog.require('TabberInternal.TabberSession');

/**
 * Global debug output control
 * @type {boolean}
 */
var debug = false;

/**
 * Convert a set of tabs into human-readable description.
 * @param {Array<Object>} tabs - Set of tabs to convert.
 * @return {string}
 */
function tabsToString(tabs) {
  var output = '';
  var activeTag = '';
  if (tabs.length > 0) {
    for (var t = 0; t < tabs.length; t++) {
      if (tabs[t].active) {
        activeTag = '>(';
      } else {
        activeTag = ' (';
      }
      activeTag += tabs[t].windowId + ')';
      output += activeTag + '\t' + '(' + tabs[t].id + ')' + tabs[t].title +
                '\n';
//      output += activeTag + 'TAB: \t' + JSON.stringify(tabs[t]) + '\n';
    }
  } else {
    output += 'Error: NO TABS found in session!\n';
  }
  return output;
}


/**
 * Define the Tabber object which holds all the Tabber properties. All Tabber
 * operations and the API are accessed from a singleton Tabber object which is
 * created, initialized and attached to the current (background) page on load.
 * @private
 * @constructor
 * @implements {TabberApi}
 */
function TabberClass() {
  // Exported stuff first
  this.state = {
    ERR: -1,
    OK: 0,
    WARN: 1,
  };

  // operational modes
  this.mode = {
    MANUAL: 'manual',
    AUTOSTART: 'autostart',
    AUTOSAVE: 'autosave',
    AUTOSYNC: 'autosync'
  };

  // Tabber-specific constants.
  this.constant_ = {
    sync_delay: 4000,        // delay from last local change to push
    urgent_sync_delay: 500,  // short delay for quick updates
    ok_status: 'Tabs saved',
    def_title: 'Click here to manage browser tabs',
    // chrome storage keys
    options_key: 'options'
  };
  // Tabber state vars.
  this.uninitialized_ = true;
  this.initialized_ = false;
  this.remoteSession_ = new TabberInternal.TabberSession();   // init when fetched
  this.localSession_ = new TabberInternal.TabberSession();    // locally known tabs
  this.change_count_ = 0; // TODO: REMOVE
  this.pending_sync_ = false;   // scheduled session check
  this.pending_update_ = false; // schedule local session update
  this.sync_in_progess_ = false;  // true while syncing browser to session
  this.save_in_progess_ = false;  // true while saving browser to session
  /** @private */
  this.options_ = {'mode': this.mode.AUTOSAVE};   // default operation
  this.windowIds_ = []; // lookup a local windowId by the remote windowId

  // Current status
  this.status_ = this.state.OK;
  this.statusMessage_ = '';
}

/**
 * Used once to initialize our state.
 * @private
 */
TabberClass.prototype.startInitialization_ = function() {
  // If there is no singleton, ignore this call
  if (!tabberSingleton) {
    consoleErrorLog('Unsolicited tabber initialization!');
    return;
  }
  // If we already started initialize, ignore this call (shouldn't happen)
  if (tabberSingleton && !tabberSingleton.uninitialized_) {
    consoleErrorLog('Duplicate tabber initialization!');
    return;
  }
  var tbr = tabberSingleton;

  // Close the init gate.
  tbr.uninitialized_ = false;

  // Fetch our saved config (if any) and continue init.
  chrome.storage.local.get('options', tbr.finishInit_);
};

/*
 * The "API" used by the popup UI consists of the following functions:
 *    saveLocalToRemote() - manual save local session as remote
 *    syncBrowserFromRemote() - manual apply remote session to browser
 *    setOptions()  - sets Tabber parameters, which are:
 *        mode (string) - operational mode ("manual", "autosync", etc.)
 *        debug (boolean) - enable console logging
 *    getStatus() - returns an object with the current state
 */

/**
 * Save the local session to the remote account.
 * Note that this may be called by the user in Manual mode from the popup UI,
 * as well as being called as a result of a session sync.
 */
TabberClass.prototype.saveLocalToRemote = function() {
  var tbr = tabberSingleton;
  consoleDebugLog('Got a Tabber.saveLocalToRemote call');
  // Don't allow overlapping saves
  if (tbr.save_in_progess_) {
    consoleTaggedLog('Overlapping Tabber.saveLocalToRemote call ignored');
    return;
  }
  tbr.save_in_progess_ = true;
  /*
   * We have to insure our local tabs are in sync with browser.
   * to do this, we need a multi-phase approach where the first phase does
   * a local session update.
   */
  tbr.syncLocalToBrowser_(tbr.saveLocalToRemote_);
};

/**
 * Sync the local browser state from the currently known remote session.
 * Note that this may be called by the user from the popup UI, as well as being
 * called from the session sync.
 */
TabberClass.prototype.syncBrowserFromRemote = function() {
  // Handy vars.
  var tbr = tabberSingleton;
  var rem = tbr.remoteSession_;
  // if remote session is not valid, don't do anything
  if (rem.generation < 0) {
    consoleErrorLog('Cannot sync from remote session yet.');
    return;
  }
  if (rem.tabs.length < 1) {
    consoleErrorLog('Cannot sync from Remote session (0 remote tabs)');
    return;
  }
  consoleDebugLog(
      'Syncing local browser from gen ' + tbr.localSession_.generation +
      ' to ' + tbr.remoteSession_.generation);
  /* In order to sync the browser with the remote session, we may have to do
   * up to four distinct ordered phases of tab operations:
   * - create/move new tab(s) to align the session data
   * - delete deprecated tabs
   * - move tabs to proper windows in Chrome
   * - set the new active tabs
   * To insure these steps are done in the above order, we count the changes
   * needed for each phase and only move on to the next phase when the last
   * change is complete
   */
  // Tell Tabber to ignore local changes while we are syncing.
  tbr.sync_in_progess_ = true;
  /*
   * We have to insure our local tabs are in sync with browser.
   * to do this, we first do a local session update.
   */
  tbr.syncLocalToBrowser_(tbr.syncBrowserCreatesAndMoves_);
};

/**
 * Set/modify Tabber operational parameters.
 * @param {TabberApi.type.config} config - The caller's specified option values.
 */
TabberClass.prototype.setOptions = function(config) {
  consoleDebugLog('setOptions() call with: ' + JSON.stringify(config));
  if (config.hasOwnProperty('mode')) {
    // only accept recognized modes
    if ((config.mode === tabberSingleton.mode.AUTOSYNC) ||
        (config.mode === tabberSingleton.mode.AUTOSTART) ||
        (config.mode === tabberSingleton.mode.AUTOSAVE) ||
        (config.mode === tabberSingleton.mode.MANUAL)) {
      // TODO: if new mode is AUTO* and sessions are not in sync, then
      // alert the user that he must do a manual save/restore before selecting
      // the specific AUTO mode. Otherwise, proceed below.
      tabberSingleton.options_.mode = config.mode;
      consoleDebugLog('New Tabber mode: ' + config.mode);
      // Save updated config in Chrome local storage. This will trigger our
      // change callback which in turn will run sync.
      chrome.storage.local.set({'options': tabberSingleton.options_});
    } else {
      alert('Unsupported Tabber operational mode: ' + config.mode);
    }
  }
  if (config.hasOwnProperty('debug')) {
    if (config.debug) {
      debug = true;
      consoleDebugLog('Turning debug ON');
    } else {
      consoleDebugLog('Turning debug OFF');
      debug = false;
    }
  }
};

/**
 * Get the current Tabber status.
 * @return {TabberApi.type.status}
 */
TabberClass.prototype.getStatus = function() {
  consoleDebugLog('Copy options: ' + JSON.stringify(tabberSingleton.options_));
  /** type {TabberApi.type.config} */
  var opts = copyObject_(tabberSingleton.options_);
  // Add the debug state
  opts.debug = debug;
  /**
   * @type {TabberApi.type.status}
   */
  var status = {
          options: opts,
          sync: {'state': tabberSingleton.status_,
                 'msg': tabberSingleton.statusMessage_},
          remote_time: tabberSingleton.remoteSession_.getTimeString()
  };
  return status;
};

/*
 * Internal Tabber code
 */

/**
 * Perform the initial phase of saving a local session, which is just to make
 * sure we have the latest tabs from chrome.
 * @private
 * @param {function()} contFunc - The function to call after tabs are updated.
 */
TabberClass.prototype.syncLocalToBrowser_ = function(contFunc) {
  var tbr = tabberSingleton;
  consoleDebugLog('Performing syncLocalToBrowser_');

  // Callback gets the current tabs info
  function currentTabs(tabs) {
    var loc = tbr.localSession_;
    consoleDebugLog('Latest local tabs:\n' + tabsToString(tabs));
    // Accept the new set of tabs
    loc.tabs = tabs;
    // Proceed with updated tabs in place.
    contFunc();
  }
  // Get the current tabs from Chrome
  chrome.tabs.query({}, currentTabs);
};

/**
 * Perform the actual save of the local session to the remote account.
 * When this phase completes, the real save operation is done.
 * @private
 */
TabberClass.prototype.saveLocalToRemote_ = function() {
  consoleDebugLog('Performing saveLocalToRemote action');
  var tbr = tabberSingleton;
  var loc = tbr.localSession_;
  var rem = tbr.remoteSession_;
  // Before we flush our local session to remote, make sure we pick a new
  // generation number that is highest.
  if (loc.generation <= rem.generation) {
    loc.generation = rem.generation + 1;
  }
  // Get a sync object which splits the tab objects into separate elements
  // so chrome.staorage.sync can handle it.
  var syncObj = loc.toSync();

  // Now we can update the remote.
  consoleDebugLog('Saving current session to remote storage');
  consoleDebugLog('Saving: ' + JSON.stringify(syncObj));
  chrome.storage.sync.set(syncObj, function() {
    if (chrome.runtime.lastError) {
      // Report error.
      tbr.setStatus_(tbr.state.ERR, 'Unable to save session: ' +
                                    chrome.runtime.lastError.message);
    } else {
      // success updating remote session
      tbr.remoteSession_ = new TabberInternal.TabberSession(tbr.localSession_);
      //      tbr.setStatus_(tbr.state.OK, 'Checking session');
    }
    // Note that saving to chrome storage will generate a storage change event,
    // which in turn will provoke a doSync
    tbr.save_in_progess_ = false;
    return;
  });
};


/**
 * This function performs the tab creates and index moves when syncing the
 * local browser to the remote session. Note that this does not actually
 * finalize the real window index, but merely the global tab index in the
 * session data. After this phase, we will resolve the tab window indexes.
 * @private
 */
TabberClass.prototype.syncBrowserCreatesAndMoves_ = function() {
  var tbr = tabberSingleton;
  var loc = tbr.localSession_;
  var rem = tbr.remoteSession_;

  // Start the work of deleting excess tabs
  consoleDebugLog('Creating/aligning tabs');

  // Init SyncPhaseHandler to manage this phase.
  TabberInternal.SyncPhaseHandler.initHandler(tbr.syncBrowserDeletes_);

  /**
   * This doStep callback updates our local tab object and restarts the remote
   * tab scanning after a chrome tab change is complete.
   * @param {*} ctx - Our local tab index for the tab being updated.
   * @param {Array<TabberInt.type.Tab>} tabArray - Updated chrome tab objects.
   */
  function onTabUpdate(ctx, tabArray) {
    consoleDebugLog('Chrome updated tab ' + ctx);
    // consoleDebugLog("Current tab is:"+JSON.stringify(loc.tabs[ctx]));
    // Update our local tab object.
    loc.tabs[ctx].index = tabArray[0].index;
    loc.tabs[ctx].id = tabArray[0].id;
    loc.tabs[ctx].windowId = tabArray[0].windowId;
    consoleDebugLog('updated loc.tab to: ' + JSON.stringify(loc.tabs[ctx]));
    // Continue scanning.
    scanRemoteTabs();
  }

  var remTabIndex = -1;
  /**
   * Reentrant function that scans the remote tabs and tries to align the local
   * tabs to match as best as possible. It will try to move a local tab to a
   * matching position in the tabs array if the content matches, or if no match
   * is found locally, it will create a new tab to match.
   */
  function scanRemoteTabs() {
    for (remTabIndex++; remTabIndex < rem.tabs.length; remTabIndex++) {
      //      consoleDebugLog('Checking tab ' + remTabIndex);
      // If corresponding tabs have major difference.
      if ((remTabIndex >= loc.tabs.length) ||
          getTabsDiff(loc.tabs[remTabIndex],
                       rem.tabs[remTabIndex]).major) {
        consoleDebugLog('Tabs at index ' + remTabIndex + ' DO NOT match');
        // check remaining local tabs (if any) for a match
        var matched = false;
        for (var tt = remTabIndex + 1; tt < loc.tabs.length; tt++) {
          // If tab with equivalent content is found
          if (!getTabsDiff(loc.tabs[tt], rem.tabs[remTabIndex]).major) {
            consoleDebugLog('Moving tab ' + tt + ' to index ' + remTabIndex);
            // Update localSession array by moving the matching tab to proper
            // position in the array. We will fix the window and index later.
            loc.tabs.splice(remTabIndex, 0, loc.tabs.splice(tt, 1)[0]);
            // Continue the scan.
            matched = true;
            break;
          }
        }
        // If we found a matching tab above.
        if (matched) {
          // Just continue the scan
          continue;
        }
        // If we got here, we couldn't find a matching tab at a different index.
        consoleDebugLog('No match for remote tab ' + remTabIndex);
        /**
         * Create pseudo-tab object to specify the new local tab.
         * @type {TabberInt.type.Tab}
         */
        var newTab = {index: remTabIndex, url: rem.tabs[remTabIndex].url};
        loc.tabs.splice(remTabIndex, 0, newTab);
        // Set a callback so we can grab real ids.
        TabberInternal.SyncPhaseHandler.setDoStepCallback(onTabUpdate, remTabIndex);
        // Tell chrome to create new browser tab.
        TabberInternal.SyncPhaseHandler.doStep(chrome.tabs.create, newTab);
        // Update our local tab object with more info. We have to do this
        // after the chrome call, because chrome doesn't like these object keys.
        consoleDebugLog('Adding title and active state');
        newTab.title = rem.tabs[remTabIndex].title;
        newTab.active = rem.tabs[remTabIndex].active;
        consoleDebugLog('loc.tab: ' + JSON.stringify(loc.tabs[remTabIndex]));
        // stop here and let step callback continue the scan.
        return;
      } else {
        consoleDebugLog('Tabs at index ' + remTabIndex + ' seem to match');
      }
    }
    // If we got here, we are done with the scan and this phase.
    TabberInternal.SyncPhaseHandler.finalize();
  }
  // Kick off the remote scan
  scanRemoteTabs();
};


/**
 * This function performs the tab deletes when syncing the local browser.
 * @private
 */
TabberClass.prototype.syncBrowserDeletes_ = function() {
  var tbr = tabberSingleton;
  var loc = tbr.localSession_;
  var rem = tbr.remoteSession_;

  // Start the work of deleting excess tabs
  consoleDebugLog(
      'Removing ' + (loc.tabs.length - rem.tabs.length) + ' excess local tabs');

  // Init SyncPhaseHandler to manage this phase.
  TabberInternal.SyncPhaseHandler.initHandler(tbr.syncBrowserChromeMapWindows_);

  // Delete any excess local tabs
  if (loc.tabs.length > rem.tabs.length) {
    for (var t = rem.tabs.length; t < loc.tabs.length; t++) {
      consoleDebugLog('Removing tab ' + t);
      TabberInternal.SyncPhaseHandler.doStep(chrome.tabs.remove, loc.tabs[t].id);
    }
    // Adjust local tabs array.
    loc.tabs.splice(rem.tabs.length, loc.tabs.length - rem.tabs.length);
  }
  // Done with this phase.
  TabberInternal.SyncPhaseHandler.finalize();

};

/**
 * Compute an affinity score based on how similar the two sets of tabs are.
 * @private
 * @param {Array<Object>} tabs1 - First array of tabs to compare.
 * @param {Array<Object>} tabs2 - First array of tabs to compare.
 * @return {number} - returns the score.
 */
function getWindowScore_(tabs1, tabs2) {
  var score = 0;
  // we award 5 pts for matching URLs
  // we award another 3 pts for matching index
  // we award another 1 pt for matching active state
  for (var t1 = 0; t1 < tabs1.length; t1++) {
    for (var t2 = 0; t2 < tabs2.length; t2++) {
      if (tabs1[t1].url == tabs2[t2].url) {
        score += 5;
        // Now check for matching index
        if (tabs1[t1].index == tabs2[t2].index) {
          score += 3;
        }
        // Check for matching active state
        if (tabs1[t1].active == tabs2[t2].active) {
          score += 1;
        }
      }
    }
  }
  return score;
}

/**
 * This function maps remote windows to local windows.
 * @private
 */
TabberClass.prototype.syncBrowserChromeMapWindows_ = function() {
  var tbr = tabberSingleton;
  var loc = tbr.localSession_;
  var rem = tbr.remoteSession_;

  // Start the work of mapping windows
  consoleDebugLog('Mapping remote and local windows');
  consoleDebugLog('Current Remote windows:\n' + tabsToString(rem.tabs));
  consoleDebugLog('Current Local windows:\n' + tabsToString(loc.tabs));

  /* The main computational goal of this phase is to pick the best mapping
   * between remote windows and local windows. If there are more remote windows
   * than existing local ones, this phase will also create new local windows
   * to match. At the end of this phase, there will be a local window for each
   * remote window, and the local session data will have the intended window
   * Ids for each tab. The next phase will insure that all tabs reside in the
   * correct window with the correct index.
   */

  // Build lists of existing remote and local windowIds
  var remWindows = [];
  var locWindows = [];
  for (var t = 0; t < rem.tabs.length; t++) {
    // if this is a new windowId
    // add this window (if not found) and tab
    if (!(rem.tabs[t].windowId in remWindows)) {
      // add tab to new windowId record
      remWindows[rem.tabs[t].windowId] = [rem.tabs[t]];
    } else {
      remWindows[rem.tabs[t].windowId].push(rem.tabs[t]);
    }
  }
  for (var t = 0; t < loc.tabs.length; t++) {
    // @type number
    var windowId = loc.tabs[t].windowId;
    // add this window (if not found) and tab
    if (!(windowId in locWindows)) {
      locWindows[windowId] = [loc.tabs[t]];
    } else {
      locWindows[windowId].push(loc.tabs[t]);
    }
  }
  // Score each possible map edge.
  var mapScores = [];
  for (var lwid in locWindows) {
    for (var rwid in remWindows) {
      var score = getWindowScore_(locWindows[Number(lwid)],
                                  remWindows[Number(rwid)]);
      mapScores.push({'lwid': lwid,
                      'rwid': rwid,
                      'score': score
                      });
    }
  }
  // Sort the maps by score - highest to lowest.
  var sortedMapScores = mapScores.sort(function(a, b) {
    if (a.score == b.score) return 0;
    return (a.score < b.score) ? 1 : -1;
  });

  /*
   * Now we have a sorted list of scores. We need to walk the list and accept
   * the highest scoring match that involves windowIds that have not already
   * been matched.
   */
  var matchedRemIds = [];
  var matchedLocIds = [];
  var locIdByRemId = [];  // final map

  // Take the highest score as a valid mapping.
  for (var mi = 0; mi < sortedMapScores.length; mi++) {
    // If we haven't mapped these ids yet.
    if ((matchedRemIds.indexOf(sortedMapScores[mi]['rwid']) == -1) &&
        (matchedLocIds.indexOf(sortedMapScores[mi]['lwid']) == -1)) {
      // Take this mapping.
      consoleDebugLog(
          'Mapping rwid ' + sortedMapScores[mi]['rwid'] + ' to lwid ' +
          sortedMapScores[mi]['lwid']);
      locIdByRemId[sortedMapScores[mi]['rwid']] = sortedMapScores[mi]['lwid'];
      // And don't reconsider either local or remote ids.
      matchedRemIds.push(sortedMapScores[mi]['rwid']);
      matchedLocIds.push(sortedMapScores[mi]['lwid']);
    }
  }

  /*
   * Now we have our mapping, so for each tab, we want to move it to the
   * corresponding local window. We may have to create new windows as we go
   */

  /**
   * This function is called after a new window and initial tab are created,
   * to add the new window Id to the window map, then continue iterating.
   * @param {(ChromeWindow|null)} newWindow - The new window Object from chrome.
   */
  function acceptNewWindow(newWindow) {
    // Get index of tab just moved to new window
    var ti = tbr.context_ - 1;
    consoleDebugLog(
        'Tab ' + loc.tabs[ti].id + ' assigned to new window ' + newWindow.id);
    consoleDebugLog(
        'New rem->loc map: ' + rem.tabs[ti].windowId + ' -> ' + newWindow.id);
    // Update the local window Id that maps to the remote window.
    locIdByRemId[rem.tabs[ti].windowId] = newWindow.id;
    // And the local session data for the rehomed tab
    loc.tabs[ti].windowId = newWindow.id;
    // now continue
    continueRehomingTabs();
  }

  /* this is the re-entrant function that works its way through the tabs,
   * creating windows as needed, or moving tabs to correct window
   */
  function continueRehomingTabs() {
    // Make each tab get displayed in the correct window.
    for (var t = tbr.context_; t < loc.tabs.length; t++) {
      var lwid = locIdByRemId[rem.tabs[t].windowId];
      if (typeof lwid == 'undefined') {
        // set re-entrant position
        tbr.context_ = t + 1;
        consoleDebugLog('No lwid found for rwid ' + rem.tabs[t].windowId);
        // create new window, then continue
        chrome.windows.create({tabId: loc.tabs[t].id}, acceptNewWindow);
        // stop here and let async continuation resume the loop
        return;
      } else if (loc.tabs[t].windowId != lwid) {
        // Move this tab to correct window (indexes are adjusted in next phase)
        consoleDebugLog(
            'Moving tab ' + loc.tabs[t].id + ' from window ' +
            loc.tabs[t].windowId + ' to ' + lwid);
        // Update local session data.
        loc.tabs[t].windowId = lwid;
        // Tell chrome to do the move.
        chrome.tabs.move(loc.tabs[t].id, {windowId: Number(lwid), index: 0});
      }
    }
    // Done with this phase.
    tbr.syncBrowserChromeMove_();
  }
  // Just set the initial tab index context and start rehoming tabs
  tbr.context_ = 0;
  continueRehomingTabs();
};

/**
 * This function moves tabs to proper window index in Chrome.
 * @private
 */
TabberClass.prototype.syncBrowserChromeMove_ = function() {
  var tbr = tabberSingleton;
  var loc = tbr.localSession_;
  var rem = tbr.remoteSession_;

  // Start the work of moving tabs
  //  consoleDebugLog('Correcting tab indexes');
  //  consoleDebugLog("Remote windows:\n" + tabsToString(rem.tabs));
  //  consoleDebugLog("Local windows:\n" + tabsToString(loc.tabs));

  // Init SyncPhaseHandler to manage this phase.
  TabberInternal.SyncPhaseHandler.initHandler(tbr.syncBrowserSetActive_);

  // Make each tab get displayed in the correct window with the correct index.
  for (var t = 0; t < loc.tabs.length; t++) {
    //    consoleDebugLog("Moving tab "+loc.tabs[t].id+" to index
    //    "+rem.tabs[t].index);
    TabberInternal.SyncPhaseHandler.doStep(chrome.tabs.move,
                        loc.tabs[t].id, {index: rem.tabs[t].index});
  }
  // Done with this phase.
  TabberInternal.SyncPhaseHandler.finalize();
};

/**
 * This function sets the active tab when syncing the local browser
 * @private
 */
TabberClass.prototype.syncBrowserSetActive_ = function() {
  var tbr = tabberSingleton;
  var loc = tbr.localSession_;
  var rem = tbr.remoteSession_;

  // Define what to do when all the steps of this phase are done.
  function phaseDone() {
    // Tell Tabber to respond to local changes again.
    consoleDebugLog('Re-enabling change monitor');
    tbr.sync_in_progess_ = false;
    // Schedule a local sesion update in case some local changes happened while
    // we were syncing and ignoring local changes.
    tbr.scheduleLocalSessionUpdate_(tbr.constant_.sync_delay);    
  }

  // Start the work of setting active states.
  consoleDebugLog('Finalizing local session...');

  // Init SyncPhaseHandler to manage this phase.
  TabberInternal.SyncPhaseHandler.initHandler(phaseDone);

  // Walk the remote tabs and set the active states.
  for (var t = 0; t < loc.tabs.length; t++) {
    // Set the local session data active state
    loc.tabs[t].active = rem.tabs[t].active;
    // And add a step to tell Chrome to do it too.
    TabberInternal.SyncPhaseHandler.doStep(chrome.tabs.update,
                        loc.tabs[t].id, {'active': rem.tabs[t].active});
  }
  // Complete this phase
  TabberInternal.SyncPhaseHandler.finalize();
};

/**
 * Reschedule a local session update. This is called after any local browser
 * changes to (re)schedule a local session eval/update.
 * @private
 * @param {number} delay - Number of milliseconds to delay before update.
 * @return {boolean} - True if update was done or scheduled OK.
 */
TabberClass.prototype.scheduleLocalSessionUpdate_ = function(delay) {
  var tbr = tabberSingleton;
  // Cancel any pending update since we are rescheduling.
  if (tbr.pending_update_) {
    clearTimeout(tbr.pending_update_);
  }
  // If we are syncing, we ignore this event (leave unscheduled).
  if (tbr.sync_in_progess_) {
    return false;
  }
  tbr.setStatus_(tbr.state.WARN, 'Local change detected - update pending');
  var scheduleDelay_ms = delay;
  // if we are starting a new session, insure a short delay
  if (tbr.localSession_.generation < 2) {
    if (scheduleDelay_ms > tbr.constant_.urgent_sync_delay) {
      scheduleDelay_ms = tbr.constant_.urgent_sync_delay;
    }
  }
  // Schedule the update.
  consoleDebugLog(
      'Scheduling update from browser event, with delay = ' + scheduleDelay_ms);
  tbr.pending_update_ =
      setTimeout(tbr.updateLocalSessionFromBrowser_, scheduleDelay_ms);
  return true;
};

/**
 * This function is called after a change to the local or remote session. The
 * primary indication of which is 'newer' is the argument to this function.
 * If it is not known, the session generation number is used as a tiebreaker
 * to reconcile differences. This function then determines what actions to take
 * in response to the change. It sets the status indications, and can kick off
 * a session save or local browser sync, as needed.
 * @private
 * @param {boolean=} localIsNewer - Indicates whether local or remote side just
 *                                  changed. If not specified, we make a guess.
 */
TabberClass.prototype.doSync_ = function(localIsNewer) {
  var tbr = tabberSingleton;
  var rem = tbr.remoteSession_;
  var loc = tbr.localSession_;
  // We need to know if this is the first sync of a new session. if so, we
  // generally do one sync before starting any auto-save operations.
  var firstTime = (loc.generation == 1);
  // If caller doesn't tell us what changed, just guess based on generation.
  if (typeof localIsNewer == 'undefined') {
    consoleDebugLog('Guessing change');
    // if in AUTOSAVE mode and this is not firstTime sync, then always assume
    // local session is newer.
    var forceNewLocal =
        ((tbr.options_.mode == tbr.mode.AUTOSAVE) && !firstTime);
    // now set authoritative session
    localIsNewer = forceNewLocal || (loc.generation >= rem.generation);
  }
  if (localIsNewer) {
    consoleDebugLog('Syncing local update...');
  } else {
    consoleDebugLog('Syncing remote update...');
  }
  // compare local and remote sessions
  var diff = getSessionDiff(loc, rem);
  consoleDebugLog('Got dif report: ' + JSON.stringify(diff));
  // Set status from diff report
  if (diff.major) {
    // If there is a major dif, status will always be ERROR or WARN
    if (diff.err) {
      tbr.setStatus_(tbr.state.ERR, diff.major);
    } else {
      tbr.setStatus_(tbr.state.WARN, diff.major);
    }
  } else if (diff.minor) {
    // For minor differences, we keep status OK, but set the minor msg.
    tbr.setStatus_(tbr.state.OK, diff.minor);
  } else {
    // No differences found.
    tbr.setStatus_(tbr.state.OK, tbr.constant_.ok_status);
  }
  // Now determine whether to do any automatic sync operation.
  // If we do not have both sessions initialized, we can't do anything yet.
  if ((rem.generation < 0) || (loc.generation < 0)) {
    consoleDebugLog('Deferring sync until session initialization');
    return;
  }
  // If we don't have a valid local session, we have to keep waiting
  if (!isSessionValid(loc)) {
    consoleErrorLog('Deferring sync until local session established');
    return;
  }
  // If we have found a difference.
  if (diff.major || diff.minor) {
    consoleDebugLog('Found differences with favor_local = ' + localIsNewer);
    consoleDebugLog('loc.gen=' + loc.generation);
    consoleDebugLog('rem.gen=' + rem.generation);
    // For newer local session
    if (localIsNewer) {
      // If this is a first time change, we don't auto save.
      if (!firstTime) {
        // In autosync and autosave mode, save the updated local session.
        // For all other modes, we never save automatically.
        if ((tbr.options_.mode == tbr.mode.AUTOSYNC) ||
            (tbr.options_.mode == tbr.mode.AUTOSAVE)) {
          tbr.saveLocalToRemote();
        }
      }
    } else {  // for newer remote session
      /* If we do not have a valid remote session, it means we couldn't
       * establish one, so just adopt the valid local one
       */
      if (!isSessionValid(rem)) {
        rem = loc;
        consoleDebugLog('No remote session found');
        // Recursively call back to insure we are all sync'd. Pretend it's as a
        // result of a local change, so it will only sync the remote bits.
        tbr.doSync_(true);
        return;
      }
      // do a local browser sync for the following modes:
      // autosync, autostart(first time only), and autosave(first time only)
      if ((tbr.options_.mode == tbr.mode.AUTOSYNC) ||
          ((tbr.options_.mode == tbr.mode.AUTOSTART) && firstTime) ||
          ((tbr.options_.mode == tbr.mode.AUTOSAVE) && firstTime)) {
        tbr.syncBrowserFromRemote();
      }
    }
  }
};

/**
 * Ask Chrome for the current set of tabs, and build/update our local session
 * with the resulting tab information.
 * This is called at the end of Tabber initialization, and also after any local
 * browser change.
 *
 * @private
 */
TabberClass.prototype.updateLocalSessionFromBrowser_ = function() {
  var tbr = tabberSingleton;
  consoleDebugLog(
      'updateLocalSessionFromBrowser_() called - getting local tabs');
  // Callback gets the current tabs info
  function currentTabs(tabs) {
    var loc = tbr.localSession_;
    consoleDebugLog('HAD local tabs:\n' + tabsToString(loc.tabs));
    consoleDebugLog('GOT local tabs:\n' + tabsToString(tabs));
    // Accept the new set of tabs
    loc.tabs = tabs;
    // if this is local session initialization, make generation = 0
    if (loc.generation < 0) {
      loc.generation = 0;
    }
    // Touch the session to update timestamp and generation.
    loc.touch();
    // For first-time init, we go init remote session now.
    if (!tbr.initialized_) {
      // Continue initialization by fetching remote storage.
      chrome.storage.sync.get(null, tbr.onStorageGet);
    } else {  // after normal update go sync
      // Update status and session states. Note that this path can happen during
      // post-init syncing
      tbr.doSync_();
    }
  }
  // Get the current tabs from Chrome
  chrome.tabs.query({}, currentTabs);
};


/**
 * This is the event handler which is called on any tab remove
 * @private
 * @param {string} tabId - Id of tab being removed.
 * @param {Object} remInfo - hold info about the removal event.
 */
TabberClass.prototype.onTabRemove_ = function(tabId, remInfo) {
  var tbr = tabberSingleton;
  var delay = tbr.constant_.sync_delay;
  // If the window is closing, don't delay the update.
  if (remInfo['isWindowClosing']) {
    delay = tbr.constant_.urgent_sync_delay;
  }
  // schedule a session update
  tbr.scheduleLocalSessionUpdate_(delay);
};

/**
 * This is the event handler which is called on any tab change
 * @private
 */
TabberClass.prototype.onTabChange_ = function() {
  var tbr = tabberSingleton;
  var delay = tbr.constant_.sync_delay;
  // schedule a session update
  tbr.scheduleLocalSessionUpdate_(delay);
};

/**
 * Enables or disables the change event handlers.
 * @private
 * @param {boolean} enable - New enable setting.
 */
TabberClass.prototype.enableHandlers_ = function(enable) {
  var tbr = tabberSingleton;
  if (enable) {
    consoleDebugLog('Enabling tab event handlers');
    chrome.tabs.onCreated.addListener(tbr.onTabChange_);
    chrome.tabs.onUpdated.addListener(tbr.onTabChange_);
    chrome.tabs.onMoved.addListener(tbr.onTabChange_);
    chrome.tabs.onActivated.addListener(tbr.onTabChange_);
    chrome.tabs.onHighlighted.addListener(tbr.onTabChange_);
    chrome.tabs.onDetached.addListener(tbr.onTabChange_);
    chrome.tabs.onAttached.addListener(tbr.onTabChange_);
    chrome.tabs.onRemoved.addListener(tbr.onTabRemove_);
    chrome.tabs.onReplaced.addListener(tbr.onTabChange_);
//    chrome.tabs.onZoomChange.addListener(tbr.onTabChange_);
  } else {
    consoleDebugLog('Removing tab event handlers');
    chrome.tabs.onCreated.removeListener(tbr.onTabChange_);
    chrome.tabs.onUpdated.removeListener(tbr.onTabChange_);
    chrome.tabs.onMoved.removeListener(tbr.onTabChange_);
    chrome.tabs.onActivated.removeListener(tbr.onTabChange_);
    chrome.tabs.onHighlighted.removeListener(tbr.onTabChange_);
    chrome.tabs.onDetached.removeListener(tbr.onTabChange_);
    chrome.tabs.onAttached.removeListener(tbr.onTabChange_);
    chrome.tabs.onRemoved.removeListener(tbr.onTabRemove_);
    chrome.tabs.onReplaced.removeListener(tbr.onTabChange_);
//    chrome.tabs.onZoomChange.removeListener(tbr.onTabChange_);
  }
};

/**
 * Second phase of initialization.
 * @private
 * @param {Object} items - storage items fetched.
 */
TabberClass.prototype.finishInit_ = function(items) {
  var tbr = tabberSingleton;
  consoleDebugLog('Current Options: ' + JSON.stringify(tbr.options_));
  if (items.options) {
    consoleDebugLog('New Options: ' + JSON.stringify(items.options));
    tbr.options_ = items.options;
  }
  // continue init by querying Chrome for current tabs.
  tbr.updateLocalSessionFromBrowser_();
};

/**
 * Callback from chrome which provides an object with all saved properties.
 * Used to initialize the remote session during Tabber intialization.
 *
 * @param {!Object} obj - Storage object fetched from chrome.storage.
 */
TabberClass.prototype.onStorageGet = function(obj) {
  var tbr = tabberSingleton;
  consoleDebugLog('Object from chrome storage: ' + JSON.stringify(obj));
  // start with an empty session
  tbr.remoteSession_ = new TabberInternal.TabberSession(0);
  var remObjs = tbr.remoteSession_.updateProps(obj);
  // Get rid of obsolete data.
  if (remObjs.length > 0) {
    consoleDebugLog('Removing excess data from remote storage: ' + remObjs);
    chrome.storage.sync.remove(remObjs);
  }
  // Resolve status and session states with new remote session.
  tbr.doSync_();
  // Complete initialization by turning on event handlers
  tbr.initialized_ = true;
  tbr.enableHandlers_(true);
  chrome.storage.onChanged.addListener(tbr.onChromeStorageChange_);
};

/**
 * This is the chrome.storage.sync listener callback for remote session changes.
 * @private
 * @type {function(!Object<string, !StorageChange>, string)}
 */
TabberClass.prototype.onChromeStorageChange_ = function(changes, namespace) {
  var tbr = tabberSingleton;
  var key;
  // updated session properties come from chrome.storage.sync
  consoleDebugLog('Chrome storage change event: ' + JSON.stringify(changes));
  // {"options":{"newValue":{"mode":"manual"}}}
  // Make a change object using newValues
  var changeObj = {};
  for (key in changes) {
    changeObj[key] = changes[key].newValue;
  }
  // Update the session.
  tbr.remoteSession_.updateProps(changeObj);
  // Update status and resolve session state with new remote info.
  tbr.doSync_(false);

  // look for updated options
  if (tbr.constant_.options_key in changes) {
    consoleDebugLog('Chrome storage TABBER OPTIONS change');
    tbr.options_ = copyObject_(changes[tbr.constant_.options_key].newValue);
    // Update status and resolve session state based on new mode.
    tbr.doSync_();
  }
};

/**
 * Called to set our displayed icon and status text.
 * @private
 * @param {TabberApi.type.state} status - The new state.
 * @param {string=} opt_errMessage - Description of the current state.
 */
TabberClass.prototype.setStatus_ = function(status, opt_errMessage) {
  tabberSingleton.status_ = status;
  if (typeof opt_errMessage == 'undefined') {
    opt_errMessage = 'No status information';
  }
  tabberSingleton.statusMessage_ = opt_errMessage;
  consoleDebugLog('Setting status: ' + opt_errMessage);
  // set our badge icons (status color)
  switch (status) {
    case tabberSingleton.state.OK:
      consoleDebugLog('Setting status to OK');
      // set badge icon GREEN
      chrome.browserAction.setIcon({
        path: {
          19: 'images/tabber_green_19.png',
          38: 'images/tabber_green_38.png'
        }
      });
      // make title default message
      chrome.browserAction.setTitle({
        title: tabberSingleton.constant_.def_title
        });
      break;
    case tabberSingleton.state.WARN:
      consoleDebugLog('Setting status to WARN');
      // set badge icon YELLOW
      chrome.browserAction.setIcon({
        path: {
          19: 'images/tabber_yellow_19.png',
          38: 'images/tabber_yellow_38.png'
        }
      });
      // make title warning message
      chrome.browserAction.setTitle({title: opt_errMessage});
      break;
    default:
      consoleDebugLog('Setting status to ERROR');
      // set badge icon RED
      chrome.browserAction.setIcon({
        path: {
          19: 'images/tabber_red_19.png',
          38: 'images/tabber_red_38.png'
        }
      });
      // make title error message
      chrome.browserAction.setTitle({title: opt_errMessage});
      break;
  }
};

/**
 * Helper to copy any object. Only handles primitive props.
 * @private
 * @param {Object} obj - The object to copy.
 * @return {Object}
 */
function copyObject_(obj) {
  return Object(JSON.parse(JSON.stringify(obj)));
}

/**
 * Helper for console logging with timestamp.
 * @param {string} msg - The msg to show.
 */
function consoleTaggedLog(msg) {
  var d = new Date();
  console.log('Tabber@' + d.toLocaleTimeString() + ': ' + msg);
}

/**
 * Produce filtered DEBUG log messages.
 * @param {string} msg - The msg to show.
 */
function consoleDebugLog(msg) {
  if (debug) {
    consoleTaggedLog('DEBUG: ' + msg);
  }
}

/**
 * Unfiltered Tagged ERROR log messages.
 * @param {string} msg - The msg to show.
 */
function consoleErrorLog(msg) {
  consoleTaggedLog('ERROR: ' + msg);
}

/*
 * Here is the Tabber loadtime operation. Auto-attach a Tabber singleton to the
 * hosting page object. This singleton has the properties which provide the
 * public access function API as well as all internal code and state.
 */
var tabberSingleton = new TabberClass();
window['Tabber'] = tabberSingleton;

// Do the one-time initialization for our singleton.
tabberSingleton.startInitialization_();

// Do the exports
goog.exportProperty(TabberClass.prototype, 'getStatus',
                    TabberClass.prototype.getStatus);
goog.exportProperty(TabberClass.prototype, 'setOptions',
                    TabberClass.prototype.setOptions);
goog.exportProperty(TabberClass.prototype, 'saveLocalToRemote',
                    TabberClass.prototype.saveLocalToRemote);
goog.exportProperty(TabberClass.prototype, 'syncBrowserFromRemote',
                    TabberClass.prototype.syncBrowserFromRemote);

consoleDebugLog('tabber.js load complete');
