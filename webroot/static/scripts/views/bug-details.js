/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

BzDeck.views.BugDetails = function BugDetailsView (view_id, bug, $bug) {
  let mql = window.matchMedia('(max-width: 1023px)');

  this.id = view_id;
  this.bug = bug;
  this.$bug = $bug;
  this.$tablist = this.$bug.querySelector('[role="tablist"]');
  this.$att_tab = this.$tablist.querySelector('[id$="-tab-attachments"]');
  this.$$tablist = new this.widgets.TabList(this.$tablist);

  this.$tablist.querySelector('[id$="history"]').setAttribute('aria-disabled', !(this.bug.history || []).length);

  this.$$tablist.bind('Selected', event => {
    let $selected = event.detail.items[0],
        $tabpanel = this.$bug.querySelector(`#${$selected.getAttribute('aria-controls')}`);

    // Scroll a tabpanel to top when the tab is selected
    $tabpanel.querySelector('[role="region"]').scrollTop = 0; // Mobile
    $tabpanel.querySelector('.scrollable-area-content').scrollTop = 0; // Desktop

    // Desktop: Show the info pane only when the timeline tab is selected
    if (!mql.matches && this.helpers.env.device.desktop) {
      this.$bug.querySelector('.bug-info').setAttribute('aria-hidden', !$selected.matches('[id$="tab-timeline"]'));
    }
  });

  // Switch the tabs when an attachment is selected on the timeline or comment form
  window.addEventListener('popstate', event => {
    if (location.pathname === `/bug/${this.bug.id}` && history.state && history.state.att_id) {
      this.$$tablist.view.selected = this.$$tablist.view.$focused = this.$att_tab;
    }
  });

  // Call BzDeck.views.Bug.prototype.init
  this.init();

  mql.addListener(mql => this.change_layout(mql));
  this.change_layout(mql);

  if (this.helpers.env.device.mobile) {
    this.add_mobile_tweaks();
  }
};

BzDeck.views.BugDetails.prototype = Object.create(BzDeck.views.Bug.prototype);
BzDeck.views.BugDetails.prototype.constructor = BzDeck.views.BugDetails;

BzDeck.views.BugDetails.prototype.change_layout = function (mql) {
  let $info_tab = this.$bug.querySelector('[id$="-tab-info"]'),
      $participants_tab = this.$bug.querySelector('[id$="-tab-participants"]'),
      $timeline_tab = this.$bug.querySelector('[id$="-tab-timeline"]'),
      $bug_info = this.$bug.querySelector('.bug-info'),
      $bug_participants = this.$bug.querySelector('.bug-participants');

  if (mql.matches || this.helpers.env.device.mobile) {  // Mobile layout
    $info_tab.setAttribute('aria-hidden', 'false');
    $participants_tab.setAttribute('aria-hidden', 'false');
    this.$bug.querySelector('[id$="-tabpanel-info"]').appendChild($bug_info);
    this.$bug.querySelector('[id$="-tabpanel-participants"]').appendChild($bug_participants);
  } else {
    if ([$info_tab, $participants_tab].includes(this.$$tablist.view.selected[0])) {
      this.$$tablist.view.selected = this.$$tablist.view.$focused = $timeline_tab;
    }

    $info_tab.setAttribute('aria-hidden', 'true');
    $participants_tab.setAttribute('aria-hidden', 'true');
    this.$bug.querySelector('article > div').appendChild($bug_info);
    this.$bug.querySelector('article > div').appendChild($bug_participants);
    this.$tablist.removeAttribute('aria-hidden');
  }
};

BzDeck.views.BugDetails.prototype.add_mobile_tweaks = function () {
  let mql = window.matchMedia('(max-width: 1023px)');

  // Hide tabs when scrolled down on mobile
  for (let $content of this.$bug.querySelectorAll('.scrollable-area-content')) {
    let info = $content.parentElement.matches('.bug-info'),
        top = 0,
        hidden = false;

    $content.addEventListener('scroll', event => {
      if (!mql.matches && info) {
        return;
      }

      let _top = event.target.scrollTop,
          _hidden = top < _top;

      if (hidden !== _hidden) {
        hidden = _hidden;
        this.$tablist.setAttribute('aria-hidden', hidden);
      }

      top = _top;
    });
  }
};

/*
 * Add the number of the comments, attachments and history entries to the each relevant tab as a small badge.
 *
 * [argument] none
 * [return] none
 */
BzDeck.views.BugDetails.prototype.add_tab_badges = function () {
  for (let prop of ['comments', 'attachments', 'history']) {
    let tab_name = prop === 'comments' ? 'timeline' : prop,
        number = (this.bug[prop] || []).length;

    this.$tablist.querySelector(`[id$="tab-${tab_name}"] label`).dataset.badge = number;
  }
};

/*
 * Render the Tracking Flags section on the bug info pane.
 *
 * [argument] none
 * [return] none
 */
BzDeck.views.BugDetails.prototype.render_tracking_flags = function () {
  let config = BzDeck.models.server.data.config,
      $outer = this.$bug.querySelector('[data-category="tracking-flags"]'),
      $flag = this.get_template('details-tracking-flag'),
      $fragment = new DocumentFragment();

  for (let name of Object.keys(this.bug.data).sort()) {
    let field = config.field[name],
        value = this.bug.data[name];

    // Check the flag type, 99 is for project flags or tracking flags on bugzilla.mozilla.org
    if (!name.startsWith('cf_') || !field.is_active || field.type !== 99) {
      continue;
    }

    $fragment.appendChild(this.fill($flag.cloneNode(true), {
      name: field.description,
      value,
    }, {
      'aria-label': field.description,
      'data-field': name,
      'data-has-value': value !== '---',
    }));
  }

  $outer.appendChild($fragment);
};

BzDeck.views.BugDetails.prototype.render_attachments = function (attachments) {
  let mobile = this.helpers.env.device.mobile,
      mql = window.matchMedia('(max-width: 1023px)'),
      $field = this.$bug.querySelector('[data-field="attachments"]');

  this.$$attachments = new BzDeck.views.BugAttachments(this.id, this.bug.id, $field);

  if ((this.bug.attachments || []).length) {
    this.$$attachments.render([for (att of this.bug.attachments) BzDeck.collections.attachments.get(att.id)]);
  }

  // Select the first non-obsolete attachment when the Attachment tab is selected for the first time
  this.$$tablist.bind('Selected', event => {
    if (mobile || mql.matches || event.detail.items[0] !== this.$att_tab ||
        this.$$attachments.$listbox.querySelector('[role="option"][aria-selected="true"]')) { // Already selected
      return;
    }

    let $first = this.$$attachments.$listbox.querySelector('[role="option"][aria-disabled="false"]');

    if ($first) {
      this.$$attachments.$$listbox.view.selected = $first;
    }
  });
};

BzDeck.views.BugDetails.prototype.render_history = function (history) {
  let $tab = this.$tablist.querySelector('[id$="-tab-history"]');

  this.$$history = new BzDeck.views.BugHistory(this.id, this.$bug.querySelector('[data-field="history"]'));

  if ((this.bug.history || []).length) {
    this.$$history.render(this.bug.history);
    $tab.setAttribute('aria-disabled', 'false');
  }
};
