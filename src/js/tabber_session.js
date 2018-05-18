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
 * tabber_session.js - Define and export the external Session object class
 * which represents a set of browser tabs.
 */
goog.provide('TabberInternal.TabberSession');

/**
 * Define the TabberSession object which holds the tabs and metadata for a
 * single session. This is the same for remote or local sessions. The optional
 * constructor argument may be an initial generation number or another
 * TabberSession object from which to clone the session data.
 * @constructor
 * @param {Object|number=} opt_initial - The optional initialization data.
 * @implements {TabberInt.TabberSession}
 */
TabberInternal.TabberSession = function(opt_initial) {
  // Construction type is determined by argument type
  // If arg is an object, assume it is another session to clone
  // otherwise (arg is number or missing) construct a new default session
  if (typeof opt_initial == 'object') {
    // To clone a session, copy it's data props.
    var clone = JSON.parse(JSON.stringify(opt_initial));
    for (var key in clone) {
      this[key] = clone[key];
    }
    // Insure the numtabs prop is set correctly.
    this.numtabs = this.tabs.length
  } else {
    // Creating a brand new session.
    this.description = 'default';
    // set generation number
    if (typeof opt_initial == 'number') {
      // initial generation number specified
      this.generation = opt_initial;
    } else {
      // default initial gen
      this.generation = -1;
    }
    // No tabs by default
    this.tabs = [];
    this.numtabs = 0;
    // No timestamp yet
    this.updateTime = false;
  }
};

/**
 * Called when there is a change, in order to update timestamps/generation.
 */
TabberInternal.TabberSession.prototype.touch = function() {
    var d = new Date();
    this.updateTime = d.getTime() - (60 * 1000 * d.getTimezoneOffset());
    this.generation++;
    consoleDebugLog('Session gen is now ' + this.generation);
  };

/**
 * Return the last touch time as a user string. If this session has not yet
 * been initialized, it returns an empty string.
 * @return {string}
 */
TabberInternal.TabberSession.prototype.getTimeString = function() {
  if (this.updateTime) {
    // get a Date object for the local timezone
    var locDate = new Date();
    // Build a Date object set to the local time of the session timestamp.
    var d = new Date(this.updateTime +
                      (60 * 1000 * locDate.getTimezoneOffset()));
    return d.toLocaleString();
  }
  return '';
};

/**
 * Return a sync object, which provides key/value pairs for the data in the
 * object in a form that chrome.storage.sync can handle.
 * @return {Object}
 */
TabberInternal.TabberSession.prototype.toSync = function() {
  // consoleDebugLog("Sess: "+JSON.stringify(tabSession));
  var syncObj = {};
  for (var property in this) {
    // Save our custom properties.
    if (this.hasOwnProperty(property)) {
      // skip tabs array property
      if (property != 'tabs') {
        syncObj[property] = this[property];
      }
    }
  }
  // Now add the tab objects
  syncObj['numtabs'] = this.tabs.length;
  for (var t = 0; t < this.tabs.length; t++) {
    syncObj['Tab_' + t] = this.tabs[t];
  }
  return syncObj;
};

/**
 * Given a single property value, update the session.
 * @param {string} key - Property name.
 * @param {Object} value - Property value.
 * @return {boolean} - whether property is recognized and accepted.
 */
TabberInternal.TabberSession.prototype.update = function(key, value) {
  if (!isPropertyValid(key)) {
    return false;
  }
  consoleDebugLog('UPDATING session ' + key + ' : ' + value);
  if (key.startsWith('Tab_')) {
    var t = parseInt(key.split('_')[1], 10);
    // ignore tabs beyond numtabs limit
    if (t >= this.numtabs) {
      consoleDebugLog('Ignoring outdated tab ' + t);
      return false;
    }
    this.tabs[t] = value;
  } else {  // for non-Tabs, we just take the property value.
    this[key] = value;
    // If we update the numtabs property, trim tabs array if needed.
    if ((key == 'numtabs') && (value < this.tabs.length)) {
      consoleDebugLog('Resetting tabs length to ' + value);
      this.tabs = this.tabs.slice(0, value);
      this.numtabs = value;
    }
  }
  // property updated
  return true;
};

/**
 * Given an object full of updated session properties, update the session.
 * @param {Object} props - Property values.
 * @returns {Array} - array of unwanted data keys
 */
TabberInternal.TabberSession.prototype.updateProps = function(props) {
  var obsoleteKeys = [];
  // Always update the 'numtabs' property first
  if ('numtabs' in props) {
    this.update('numtabs', props['numtabs']);
  } else {
    consoleDebugLog('Update keeps number of tabs at '+ this.numtabs);
  }
  // now iterate all props
  for (var key in props) {
    if (!this.update(key, props[key])) {
      obsoleteKeys.push(key);
    }
  }
  return obsoleteKeys;
};

/**
 * Given a sync object, set the session properties to match.
 * @param {Object} syncObj - Sync object of a session.
 */
TabberInternal.TabberSession.prototype.fromSync = function(syncObj) {
  // consoleDebugLog("Sess: "+JSON.stringify(syncObj));
  for (var property in syncObj) {
    // save tabs
    if (property.startsWith('Tab_')) {
      this.tabs.push(syncObj[property]);
    } else {
      this[property] = syncObj[property];
    }
  }
  this.numtabs = Number(this.tabs.length);
};

/**
 * Return user-friendly session info (for debug/printing).
 * @return {string}
 */
TabberInternal.TabberSession.prototype.toString = function() {
  // consoleDebugLog("Sess: "+JSON.stringify(tabSession));
  var output = this.description + ' (' + this.generation + ')\n';
  output += 'Last update: ' + this.getTimeString() + '\n';
  // debug print the tab titles
  output += tabsToString(this.tabs);
  return output;
};

/**
 * Helper to print session info to console.
 * @param {string} label - Label to tag the output with.
 */
TabberInternal.TabberSession.prototype.printSession = function(label) {
  // consoleDebugLog("Sess: "+JSON.stringify(tabSession));
  var tag = ' ';
  if (label) {
    tag = label + ' ';
  }
  consoleDebugLog(tag + 'Session: ' + this.toString());
};


/**
 * Tests for recognized property.
 * @param {string} prop - The property name to check.
 * @return {boolean}
 */
function isPropertyValid(prop) {
  if (!prop) {
    consoleDebugLog('No Proprty found');
    return false;
  }
  // create a dummy session
  var sess = new TabberInternal.TabberSession();

  // We only allow named tab element property setting
  if (prop.startsWith('Tab_')) return true;
  if (prop == 'tabs') return false;

  // All other props are ok.
  if (prop in sess) return true;

  return false;
}

/**
 * Tests for session validity.
 * @param {TabberInt.TabberSession} sess - The session to check.
 * @return {boolean}
 */
function isSessionValid(sess) {
  if (!sess) {
    consoleDebugLog('No Session found');
    return false;
  }
  // validate the official properties of a session
  if (typeof sess.description != 'string') {
    consoleDebugLog('Session has bad description');
    return false;
  }
  if (typeof sess.updateTime != 'number') {
    consoleDebugLog('Session has bad updateTime');
    consoleDebugLog('Session updateTime type = ' + typeof sess.updateTime);
    consoleDebugLog(
        'Session has updateTime: ' + JSON.stringify(sess.updateTime));
    return false;
  }
  if (typeof sess.generation != 'number') {
    consoleDebugLog('Session has bad generation');
    return false;
  }
  if (typeof sess.tabs != 'object') {
    consoleDebugLog('Session has bad tabs');
    return false;
  }
  if (sess.tabs.length < 1) {
    consoleDebugLog('Session has NO tabs');
    return false;
  }
  // check the critical tab props
  for (var t = 0; t < sess.tabs.length; t++) {
    // index
    if ((typeof sess.tabs[t].index != 'number') || (sess.tabs[t].index < 0)) {
      consoleDebugLog('Session tab ' + t + ' has bad index');
      return false;
    }
    // url
    if (typeof sess.tabs[t].url != 'string') {
      consoleDebugLog('Session tab ' + t + ' has bad url');
      return false;
    }
    // id
    if ((typeof sess.tabs[t].id != 'number') || (sess.tabs[t].id < 0)) {
      consoleDebugLog('Session tab ' + t + ' has bad id');
      return false;
    }
  }
  return true;
}

/**
 * This tests whether there are any major or minor differences between the
 * local and remote sessions. If so, it returns an object describing the first
 * difference found. Major differences are checked first and no minor
 * differences are returned if any major difference is found.
 * @param {TabberInt.TabberSession} loc - Local session to compare.
 * @param {TabberInt.TabberSession} rem - Remote session to compare.
 * @return {TabberInt.type.TabDiff}
 */
function getSessionDiff(loc, rem) {
  consoleDebugLog('Checking for session diffs...');
  /** @type {TabberInt.type.TabDiff} */
  var result = {major: '', minor: '', err: false};
  // debug print the sessions
  loc.printSession('Local');
  rem.printSession('Remote');

  // first make sure we have valid local and remote sessions
  if (loc.generation < 0) {
    result.major = 'Local browser not initialized yet';
    result.err = true;
    consoleDebugLog(result.major);
    return result;
   }
   if ((!loc.tabs) || (loc.tabs.length < 1)) {
     result.major = 'No browser tabs found';
     result.err = true;
     consoleDebugLog(result.major);
     // Mark the local session as uninitialized.
     loc.generation = -1;
     return result;
   }
   if (rem.generation < 0) {
     result.major = 'No saved session found';
     result.err = true;
     consoleDebugLog(result.major);
     return result;
   }
   if ((!rem.tabs) || (rem.tabs.length < 1)) {
     result.major = 'No saved tabs found';
     consoleDebugLog(result.major);
     // Mark the remote session as uninitialized.
     rem.generation = -1;
     return result;
   }

   var localOrder = 'Saved session has ';
   var tabDiff = getTabsetDiff(loc.tabs, rem.tabs);
   // Look for session differences to report.
   if (tabDiff.major) {
     result.major = localOrder + tabDiff.major;
   } else if (tabDiff.minor) {
     result.minor = localOrder + tabDiff.minor;
   }
   // If we have a diff, handle it here.
   if (result.major || result.minor) {
     // Make sure we don't have a gen tie.
     if (loc.generation == rem.generation) {
       loc.generation++;
     }
     // Report to caller.
     return result;
   }

   /* We didn't find any differences; silently fix any data inconsistencies */

   // Check the generation.
   if (loc.generation != rem.generation) {
     // for generation mismatch, take the remote gen
     loc.generation = rem.generation;
     consoleDebugLog('Rebased local session to gen ' + loc.generation);
   }

   // Check last change time.
   if (loc.updateTime != rem.updateTime) {
     // for updateTime mismatch, take the later time
     loc.updateTime = rem.updateTime = Math.max(loc.updateTime,
                                                rem.updateTime);
     consoleDebugLog('Resolved update time: ' + loc.getTimeString());
   }

   consoleDebugLog('Active and saved sessions are in sync');
   return result;
}

