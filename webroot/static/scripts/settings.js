/**
 * BzDeck Settings Page
 * Copyright © 2014 Kohei Yoshino. All rights reserved.
 */

'use strict';

let BzDeck = BzDeck || {};

BzDeck.SettingsPage = function () {
  let tablist = BzDeck.toolbar.tablist,
      $existing_tab = document.querySelector('#tab-settings');

  if ($existing_tab) {
    tablist.view.selected = tablist.view.$focused = $existing_tab;
    return;
  }

  let $content = document.querySelector('#tabpanel-settings-template').content.cloneNode(true),
      $tabpanel = this.$tabpanel = $content.querySelector('[role="tabpanel"]');

  let $tab = tablist.add_tab(
    'settings',
    'Settings', // l10n
    'Settings', // l10n
    $tabpanel
  );

  tablist.view.selected = tablist.view.$focused = $tab;

  // Currently the radiogroup/radio widget is not data driven.
  // A modern preference system is needed.
  this.activate_radiogroups();
};

BzDeck.SettingsPage.prototype.activate_radiogroups = function () {
  let $root = document.documentElement, // <html>
      i18n = FlareTail.util.i18n,
      activate = this.activate_radiogroup.bind(this);

  let update_date_format = (option, value) => {
    i18n.options.date[option] = value;

    // Update timezone & format on the current view
    for (let $element of document.querySelectorAll('time')) {
      $element.textContent = i18n.format_date($element.dateTime,
                                              $element.dataset.simple === 'true');
    }
  };

  // Theme
  activate('theme', 'Dark', value => FlareTail.util.theme.selected = value);

  // Timezone & Date Format
  activate('date-timezone', 'local', value => update_date_format('timezone', value));
  activate('date-format', 'relative', value => update_date_format('format', value));

  // Home
  activate('home-layout', 'classic', value => BzDeck.homepage.change_layout(value, true));

  // Timeline
  activate('timeline-order', 'ascending', value => {
    for (let $timeline of document.querySelectorAll('.bug-timeline')) {
      $timeline.setAttribute('aria-busy', 'true');

      for (let $comment of [...$timeline.querySelectorAll('[itemprop="comment"]')].reverse()) {
        $comment.parentElement.appendChild($comment);
      }

      $timeline.removeAttribute('aria-busy');
    }
  });
  activate('timeline-font-family', 'monospace', value => {
    $root.setAttribute('data-timeline-font-family', value);
  });
};

BzDeck.SettingsPage.prototype.activate_radiogroup = function (id, default_value, callback) {
  let $rgroup = this.$tabpanel.querySelector('#tabpanel-settings-setting-' + id),
      prefs = BzDeck.data.prefs,
      pref = $rgroup.dataset.pref;

  for (let $radio of $rgroup.querySelectorAll('[role="radio"]')) {
    $radio.tabIndex = 0;
    $radio.setAttribute('aria-checked', $radio.dataset.value === (prefs[pref] || default_value));
  }

  (new FlareTail.widget.RadioGroup($rgroup)).bind('Selected', event => {
    let value = prefs[pref] = event.detail.items[0].dataset.value;

    if (callback) {
      callback(value);
    }
  });
};
