/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Define the Home Page Presenter.
 * @extends BzDeck.BasePresenter
 * @todo Move this to the worker thread.
 */
BzDeck.HomePagePresenter = class HomePagePresenter extends BzDeck.BasePresenter {
  /**
   * Get a HomePagePresenter instance.
   * @param {String} id - Unique instance identifier shared with the corresponding view.
   * @returns {HomePagePresenter} New HomePagePresenter instance.
   */
  constructor (id) {
    super(id); // Assign this.id

    // Subscribe to events
    this.subscribe('V#UnknownFolderSelected');
  }

  /**
   * Called whenever an unknown folder is selected in the navigator.
   * @listens HomePageView#UnknownFolderSelected
   */
  on_unknown_folder_selected () {
    BzDeck.router.navigate('/home/inbox');
  }
}
