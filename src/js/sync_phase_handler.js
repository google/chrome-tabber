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
 * sync_phase_handler.js - Provides a management mechanism for serializing a
 * sequence of asynchronous chrome API calls, and kicking off the subsequent
 * processing when the last call is complete.
 */

goog.provide('TabberInternal.SyncPhaseHandler');

/**
 * Private globals
 */

/**
 * @private
 * @type {number}
 */
var change_count_;

/**
 * @private
 * @type {boolean}
 */
var pending_changes;

/**
 * @private
 * @type {function()}
 */
var completionCallback;

/**
 * @private
 * @type {?function(*, Array<*>)}
 */
var stepCallback;

/**
 * @private
 * @type {?*}
 */
var stepCallbackContext;


/**
 * Initialize the state of the SyncPhaseHandler for a new phase.
 * @param {function()} callback - The function to call when all chrome callbacks
 *                               are complete.
 */
TabberInternal.SyncPhaseHandler.initHandler = function(callback) {
  change_count_ = 0;
  pending_changes = true;
  completionCallback = callback;
};

/**
 * Register a callback for the next doStep completion.
 * @param {function(*, Array<*>)} callback - called after next doStep.
 * @param {*} ctx - Context passed to callback function.
 * @return {undefined}
 */
TabberInternal.SyncPhaseHandler.setDoStepCallback = function(callback, ctx) {
//  consoleLog('setDoStepCallback callback = ' + callback);
//  consoleLog('setDoStepCallback ctx = ' + JSON.stringify(ctx));
  stepCallback = callback;
  stepCallbackContext = ctx;
};

/**
 * Submit a phase step function call. Func must be of the form:
 *     function func(arg1, arg2, ..., callback);
 * @param {!function(...)} chromeFunction - Required chrome function to call.
 * @param {...} arglist - Zero to many arbitrary optional args.
 * @return {undefined}
 */
TabberInternal.SyncPhaseHandler.doStep = function(chromeFunction, arglist) {
//  consoleLog('doStep called w/' + arguments.length + ' args');
  // Convert arguments to an args Array so we can manipulate it
  var args = (arguments.length === 1 ? [arguments[0]] :
                                       Array.apply(null, arguments));
  // The function is the first argument
  var func = args.shift();
  // The function is expected to take a callback as the last argument
  args.push(TabberInternal.SyncPhaseHandler.changeDone);
  // Increment for our pending func callback
  change_count_++;
  // call the func
  /*
  for (var a = 0; a < args.length; a++) {
    if (a == args.length - 1) {
      consoleLog('chrome func arg ' + a + ': ' + args[a]);
    } else {
      consoleLog('chrome func arg ' + a + ': ' + JSON.stringify(args[a]));
    }
  }
  */
  chromeFunction.apply(null, args);
};


/**
 * Called by Chrome as API callback.
 * @param {*} arglist - Whatever chrome passes to the callback.
 * @return {undefined}
 */
TabberInternal.SyncPhaseHandler.changeDone = function(arglist) {
//  consoleLog('changeDone gets ' + arguments.length + ' args, first: ' +
//             JSON.stringify(arglist));

  // First call the step callback if applicable.
  if (stepCallback) {
//    consoleLog('On changeDone, calling ' + stepCallback);
    // Convert chrome callback arguments to an Array.
    var args = (arguments.length === 1 ? [arguments[0]] :
                                         Array.apply(null, arguments));
    // Save the callback info locally, so we can clear it before the call.
    var loc_stepCallback = stepCallback;
    var loc_stepCallbackContext = stepCallbackContext;
    // Reset the global callback info.
    stepCallback = null;
    stepCallbackContext = null;
    // Pass it to the callback along with his preset context.
    loc_stepCallback(loc_stepCallbackContext, args);
  }
/*
  consoleLog('On changeDone, SyncPhaseHandle.change_count_=' +
              change_count_);
  consoleLog('On changeDone, SyncPhaseHandle.pending_changes=' +
              pending_changes);
*/
  // decrement change count (should never go negative)
  if (change_count_ > 0) {
    change_count_--;
  }
  // if it reached zero and no more changes are pending
  if ((change_count_ == 0) && !pending_changes) {
    // then call the completion callback
//    consoleLog('SyncPhaseHandler calling completion');
    completionCallback();
  }
};


/**
 * Finalize this phase. Called after all steps are submitted.
 * @return {undefined}
 */
TabberInternal.SyncPhaseHandler.finalize = function() {
//  consoleLog('SyncPhaseHandler.finalize called (cc=' + change_count_);
  // The last change completion will move to the next phase
  pending_changes = false;
  // If last change already completed, we can move on here
  if (change_count_ == 0) {
    TabberInternal.SyncPhaseHandler.changeDone(null);
  }
};

