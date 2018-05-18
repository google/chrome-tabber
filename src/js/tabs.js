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
 * tabs.js - Provides functions for working with Tab objects.
 */

/**
 * This function simply counts the number of windowids in a set of tabs.
 * @param {Array<TabberInt.type.Tab>} tabs - Set of tabs to examine.
 * @return {number}
 */
function getTabsetWinCount(tabs) {
  var winset = {};
  for (var t = 0; t < tabs.length; t++) {
    /** type {TabberInt.type.Tab} */
    var tab = tabs[t];
    winset[tab.windowId] = true;
  }
  return Object.keys(winset).length;
}

/**
 * Examine two tabs and report on the first difference found (if any). This
 * looks first for a major difference, and if not found, a minor difference.
 * Returns an object with 'minor' and 'major' keys, whos values are strings
 * describing the first difference found. Only one difference is indicated.
 * @param {Object} tab1 - First tab to compare.
 * @param {Object} tab2 - Second tab to compare.
 * @return {TabberInt.type.TabDiff}
 */
function getTabsDiff(tab1, tab2) {
  /** @type {TabberInt.type.TabDiff} */
  var result = {major: '', minor: '', err: false};
  // Look for a major difference.
  // First, compare URLs.
  if (tab1.url != tab2.url) {
    consoleDebugLog(
        'Tab \'' + tab1.title + '\' and tab \'' + tab2.title +
        '\' have different URLs');
    consoleDebugLog('Tab1: ' + tab1.url);
    consoleDebugLog('Tab2: ' + tab2.url);
    result.major = 'different URLs';
    return result;
  }
  // Check for a minor diff: active state
  if (tab1.active != tab2.active) {
    consoleDebugLog(
        'Tab \'' + tab1.title + '\' and tab \'' + tab2.title +
        '\' have different active state');
    result.minor = 'a different active tab.';
  }
  return result;
}

/**
 * This is the function that compares sets of tabs from two sessions to find
 * any major or minor differences between them. Results are always given from
 * the perspective of the second set of tabs.
 * @param {Array<Object>} tabs1 - First set of tabs to compare.
 * @param {Array<Object>} tabs2 - Second set of tabs to compare.
 * @return {TabberInt.type.TabDiff}
 */
function getTabsetDiff(tabs1, tabs2) {
  /** @type {TabberInt.type.TabDiff} */
  var dif = {major: '', minor: '', err: false};
  // First see if sets have same number of tabs.
  if (tabs1.length != tabs2.length) {
    if (tabs1.length > tabs2.length) {
      dif.major = (tabs1.length - tabs2.length) + ' fewer tabs';
    } else {
      dif.major = (tabs2.length - tabs1.length) + ' more tabs';
    }
    return dif;
  }
  // Check if sets have same number of windows.
  var wincnt1 = getTabsetWinCount(tabs1);
  var wincnt2 = getTabsetWinCount(tabs2);
  if (wincnt1 != wincnt2) {
    if (wincnt1 > wincnt2) {
      dif.major = (wincnt1 - wincnt2) + ' fewer windows';
    } else {
      dif.major = (wincnt2 - wincnt1) + ' more windows';
    }
    return dif;
  }

  // Tab sets have same number of tabs/windows, so look closer
  for (var t = 0; t < tabs1.length; t++) {
    var diff = getTabsDiff(tabs1[t], tabs2[t]);
    // If we found a major difference, we can stop here
    if (diff.major) {
      return diff;
    }
    // Save the first minor diff (in case we don't find any major difs)
    if (diff.minor && !dif.minor) {
      dif.minor = diff.minor;
    }
  }
  return dif;
}

