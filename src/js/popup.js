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

// The popup script provides the UI for the current Tabber state

/**
 * Gets Tabber access from the background page.
 * @return {TabberApi}
 */
function getTabber() {
  var bgPage = chrome.extension.getBackgroundPage();
  if (!bgPage) {
    // Really shouldn't happen
    alert('Chrome error accessing background page!\n' +
          'Re-install Tabber and/or restart Chrome!');
  }
  /**
   * Get the background page's Tabber singleton.
   * @return {TabberApi}
   */
  var tabber = bgPage['Tabber'];
  if (!tabber) {
    // Really shouldn't happen
    alert('Tabber not found! Reload Tabber extension and try again.');
  }
  return tabber;
}

/**
 * UI event handler to grab the current tabs and save them.
 */
function onSave() {
  console.log('Trying to do a Tabber.saveLocalToRemote');
  getTabber()['saveLocalToRemote']();
  console.log('Tabber.saveLocalToRemote call done');
  // Dismiss our popup.
  window.close();
}

/**
 * UI event handler to grab the saved tabs and make the browser match.
 */
function onRestore() {
  console.log('Trying to do a Tabber.syncBrowserFromRemote');
  getTabber()['syncBrowserFromRemote']();
  console.log('Tabber.syncBrowserFromRemote call done');
  // Dismiss our popup.
  window.close();
}

/**
 * UI event handler to merge the saved tabs with the current browser tabs.
 */
function onMerge() {
  console.log('Trying to do a Tabber.mergeBrowserWithRemote');
  // TODO: enable this when ready
//  getTabber()['mergeBrowserWithRemote']();
  // Dismiss our popup.
  window.close();
}

/**
 * Swap the tabs in the saved session with current browser tabs
 */
function onSwap() {
  console.log('Trying to do a Tabber.swapBrowserWithRemote');
  // TODO: enable this when ready
//  getTabber()['mergeBrowserWithRemote']();
  // Dismiss our popup.
  window.close();
}

/**
 * Event handler to set the Tabber mode from the UI.
 */
function onManualMode() {
  var tbr = getTabber();
  tbr.setOptions({mode: tbr.mode.MANUAL});
}

/**
 * Event handler to set the Tabber mode from the UI.
 */
function onAutostartMode() {
  var tbr = getTabber();
  tbr.setOptions({mode: tbr.mode.AUTOSTART});
}

/**
 * Event handler to set the Tabber mode from the UI.
 */
function onAutosaveMode() {
  var tbr = getTabber();
  tbr.setOptions({mode: tbr.mode.AUTOSAVE});
}

/**
 * Event handler to set the Tabber mode from the UI.
 */
function onAutosyncMode() {
  var tbr = getTabber();
  tbr.setOptions({mode: tbr.mode.AUTOSYNC});
}

/**
 * Event handler that set Tabber debug mode from UI.
 */
function onDebugMode() {
  // Get new debug mode state
  /** type {boolean} */
  var state = document.getElementById('debug_mode').checked;
  getTabber().setOptions({debug: state});
}

// Once the popup page is loaded, finish init
document.addEventListener('DOMContentLoaded', function() {
  /**
   * @type {TabberApi}
   */
  var tbr = getTabber();
  var status = tbr.getStatus();
  // init our UI
  if (status.options.mode == 'autosync') {
    document.getElementById('autosync').checked = true;
  } else if (status.options.mode == 'autosave') {
    document.getElementById('autosave').checked = true;
  } else if (status.options.mode == 'autostart') {
    document.getElementById('autostart').checked = true;
  } else {
    document.getElementById('manual').checked = true;
  }
  document.getElementById('debug_mode').checked = status.options.debug;

  // set our status message
  var diff = document.getElementById('diff');
  // Show Tabber sync message
  diff.textContent = status.sync.msg;
  // set text field color by status
  if (status.sync.state == tbr.state.OK) {
    diff.style.backgroundColor = 'lightgreen';
  } else if (status.sync.state == tbr.state.WARN) {
      diff.style.backgroundColor = 'yellow';
  } else {
      diff.style.backgroundColor = 'salmon';
  }
  // If we have a remote session, show its' timestamp.
  // Also, the ability to restore is based on a valid remote session.
  if (status['remote_time']) {
    document.getElementById('timestamp').textContent = 'Saved session from: ' +
      status['remote_time'];
    document.getElementById('restore').disabled = false;
  } else {
    document.getElementById('timestamp').textContent = 'No saved session available';
    document.getElementById('restore').disabled = true;
  }

  // TODO: add merge capability when supported by Tabber
  document.getElementById('merge').disabled = true;

  // TODO: add swap  capability when supported by Tabber
  document.getElementById('swap').disabled = true;

  // TODO: enable full autosync capability when better tested
  // document.getElementById('autosync').disabled = true;

  // hook our action functions to UI elements
  document.getElementById('restore').addEventListener('click', onRestore);
  document.getElementById('save').addEventListener('click', onSave);
  document.getElementById('merge').addEventListener('click', onMerge);
  document.getElementById('swap').addEventListener('click', onSwap);
  document.getElementById('manual').addEventListener('click', onManualMode);
  document.getElementById('autostart').addEventListener('click', onAutostartMode);
  document.getElementById('autosave').addEventListener('click', onAutosaveMode);
  document.getElementById('autosync').addEventListener('click', onAutosyncMode);
  document.getElementById('debug_mode').addEventListener('click', onDebugMode);
});




