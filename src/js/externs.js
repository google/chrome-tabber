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
 * Define the Tabber interface which provides the external tabber access.
 * All external Tabber access goes through a singleton Tabber object which
 * implements this interface.
 * @fileoverview
 */

/**
 * Define the actual Tabber API interface.
 * @interface
 */
function TabberApi() {}

/**
 * @type TabberApi.type.mode
 */
TabberApi.prototype.mode;

/**
 * @type TabberApi.type.state
 */
TabberApi.prototype.state;

/**
 * Save the current local tabs.
 */
TabberApi.prototype.saveLocalToRemote = function() {};

/**
 * Set the browser tabs to match the saved set.
 */
TabberApi.prototype.syncBrowserFromRemote = function() {};

/**
 * Setting Tabber options.
 * @param {TabberApi.type.config} config - The desired config option values.
 * @return {undefined}
 */
TabberApi.prototype.setOptions = function(config) {};

/**
 * Getting Tabber status.
 * @return {TabberApi.type.status}
 */
TabberApi.prototype.getStatus = function() {};

/**
 * Define type property and associated TabberApi types.
 */
TabberApi.type = function() {};

/**
 * Define information types.
 * @typedef {{
 *   OK: number,
 *   WARN: number,
 *   ERR: number
 * }}
 */
TabberApi.type.state;

/**
 * Define operational modes.
 * @typedef {{
 *   AUTOSYNC: string,
 *   AUTOSTART: string,
 *   AUTOSAVE: string,
 *   MANUAL: string
 * }}
 */
TabberApi.type.mode;

/**
 * Define operational configuration options.
 * @typedef {{
 *   mode: (undefined|string),
 *   debug: (undefined|boolean)
 * }}
 */
TabberApi.type.config;

/**
 * Define information types.
 * @typedef {{
 *   state: string,
 *   msg: string
 * }}
 */
TabberApi.type.sync_state;

/**
 * Define information types.
 * @typedef {{
 *   options: TabberApi.type.config,
 *   sync: TabberApi.type.sync_state,
 *   remote_time: string
 * }}
 */
TabberApi.type.status;

