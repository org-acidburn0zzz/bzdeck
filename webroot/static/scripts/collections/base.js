/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

BzDeck.collections = BzDeck.collections || {};

/**
 * Define the app's Base Collection. This constructor is intended to be inherited by the app's each collection.
 *
 * @constructor
 * @extends Collection
 * @argument {undefined}
 * @return {Object} collection - New BaseCollection instance.
 */
BzDeck.collections.Base = function BaseCollection () {};

BzDeck.collections.Base.prototype = Object.create(FlareTail.app.Collection.prototype);
BzDeck.collections.Base.prototype.constructor = BzDeck.collections.Base;
