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
 * Define the Tabber internal types and classes which are not exposed to the
 * popup UI, but still need to be name-protected or type checked inside Tabber.
 * @fileoverview
 */

/**
 * Define the TabberInt object which defines the internal types and methods.
 * @interface
 */
function TabberInt() {}

/**
 * Define Tab object fields we care about. The only required fields are the
 * url and the index (which are also the only ones that can be specified to
 * chrome when creating a new tab).
 * @typedef {{
 *  url: string,
 *  index: string,
 *  id: (string|undefined),
 *  windowId: (number|undefined),
 *  active: (boolean|undefined),
 *  title: (string|undefined)
 * }}
 */
TabberInt.type.Tab;

/**
 * Define tabdiff object fields.
 * @typedef {{
 *   major: string,
 *   minor: string,
 *   err: boolean
 * }}
 */
TabberInt.type.TabDiff;

/**
 * Define the TabberSession object which holds saved tabs data.
 * @interface
 */
TabberInt.TabberSession = function() {};

/** @type {string} */
TabberInt.TabberSession.prototype.description;

/** @type {number} */
TabberInt.TabberSession.prototype.generation;

/** @type {Object|number} */
TabberInt.TabberSession.prototype.numtabs;

/** @type {Array<TabberInt.type.Tab>} */
TabberInt.TabberSession.prototype.tabs;

/** @type {number|boolean} */
TabberInt.TabberSession.prototype.updateTime;

/**
 * Helper to print session info to console.
 * @param {string} label - Label to tag the output with.
 */
TabberInt.TabberSession.prototype.printSession = function(label) {};

/**
 * Return the last touch time as a user string. If this session has not yet
 * been initialized, it returns an empty string.
 * @return {string}
 */
TabberInt.TabberSession.prototype.getTimeString = function() {};

