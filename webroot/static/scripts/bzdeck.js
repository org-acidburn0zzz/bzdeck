/**
 * BzDeck Application Logic
 * Copyright © 2014 Kohei Yoshino. All rights reserved.
 */

'use strict';

let BzDeck = BzDeck || {};

/* ------------------------------------------------------------------------------------------------------------------
 * Bootstrap
 * ------------------------------------------------------------------------------------------------------------------ */

BzDeck.bootstrap = {};

BzDeck.bootstrap.start = function () {
  let status = message => BzDeck.core.show_status(message);

  this.$form = document.querySelector('#app-login form');
  this.$input = this.$form.querySelector('[role="textbox"]');
  this.$button = this.$form.querySelector('[role="button"]');
  BzDeck.core.$statusbar = document.querySelector('#app-login [role="status"]');

  // Delete the old DB
  indexedDB.deleteDatabase('BzDeck');

  BzDeck.model.open_global_database().then(database => {
    BzDeck.model.databases.global = database;
  }, error => {
    status('Failed to open the database. Make sure you’re not using private browsing mode or IndexedDB doesn’t work.');
  }).then(() => {
    return BzDeck.model.get_active_account();
  }).then(account => {
    BzDeck.model.data.account = account;
  }).then(() => {
    return BzDeck.model.get_server(BzDeck.model.data.account.host);
  }).then(server => {
    BzDeck.model.data.server = server;
  }).catch(() => {
    status('');

    return new Promise(resolve => {
      this.show_login_form().then(() => {
        // TODO: Users will be able to choose an instance on the sign-in form
        return BzDeck.model.get_server('mozilla');
      }).then(server => {
        BzDeck.model.data.server = server;
      }).then(() => {
        status('Verifying your account...'); // l10n

        return BzDeck.model.fetch_user(this.$input.value);
      }).then(account => {
        account.active = true;
        account.loaded = Date.now(); // key
        account.host = BzDeck.model.data.server.name;
        BzDeck.model.data.account = account;
        BzDeck.model.save_account(account);
        resolve();
      }).catch(error => {
        if (error.message === 'Network Error') {
          status('Failed to sign in. Network error?'); // l10n
        } else if (error.message === 'User Not Found') {
          status('Your account could not be found. Please check your email adress and try again.'); // l10n
        } else {
          status(error.message);
        }

        this.$input.disabled = this.$button.disabled = false;
      });
    });
  }).then(() => {
    return BzDeck.model.open_account_database();
  }).then(database => {
    BzDeck.model.databases.account = database;
  }, error => {
    status('Failed to open the database. Make sure you’re not using private browsing mode or IndexedDB doesn’t work.');
  }).then(() => {
    return BzDeck.model.load_prefs();
  }).then(() => {
    status('Loading bugs...'); // l10n
    document.querySelector('#app-intro').style.display = 'none';
    this.$form.setAttribute('aria-hidden', 'true');

    return Promise.all([
      BzDeck.model.fetch_subscriptions(),
      BzDeck.model.load_config().then(config => {
        BzDeck.model.data.server.config = config
      }, error => {
        this.$input.disabled = this.$button.disabled = true;
        status(error.message);
      })
    ]);
  }).then(() => {
    if (!this.relogin) {
      // Finally load the UI modules
      BzDeck.bootstrap.setup_ui();
    }
  }, error => {
    status(error.message);
  }).then(() => {
    this.show_notification();
    this.finish();
  });
};

BzDeck.bootstrap.show_login_form = function (firstrun = true) {
  this.$form.setAttribute('aria-hidden', 'false');
  this.$input.disabled = this.$button.disabled = false;
  this.$input.focus();

  if (!firstrun) {
    return true;
  }

  return new Promise((resolve, reject) => {
    this.$form.addEventListener('submit', event => {
      if (!this.processing) {
        // User is trying to re-login
        this.relogin = true;
        this.processing = true;
      }

      if (navigator.onLine) {
        this.$input.disabled = this.$button.disabled = true;
        resolve();
      } else {
        reject(new Error('You have to go online to sign in.')); // l10n
      }

      event.preventDefault();

      return false;
    });
  });
};

BzDeck.bootstrap.setup_ui = function () {
  BzDeck.core.show_status('Loading UI...'); // l10n

  let datetime = FlareTail.util.datetime,
      prefs = BzDeck.model.data.prefs,
      value,
      theme = prefs['ui.theme.selected'],
      FTut = FlareTail.util.theme,
      $root = document.documentElement;

  // Automatically update relative dates on the app
  datetime.options.updater_enabled = true;

  // Date format
  value = prefs['ui.date.relative'];
  datetime.options.relative = value !== undefined ? value : true;

  // Date timezone
  value = prefs['ui.date.timezone'];
  datetime.options.timezone = value || 'local';

  // Timeline: Font
  value = prefs['ui.timeline.font.family'];
  $root.setAttribute('data-timeline-font-family', value || 'proportional');

  // Timeline: Sort order
  value = prefs['ui.timeline.sort.order'];
  $root.setAttribute('data-timeline-sort-order', value || 'ascending');

  // Timeline: Changes
  value = prefs['ui.timeline.show_cc_changes'];
  $root.setAttribute('data-timeline-show-cc-changes', value !== undefined ? value : false);

  // Timeline: Attachments
  value = prefs['ui.timeline.display_attachments_inline'];
  $root.setAttribute('data-timeline-display-attachments-inline', value !== undefined ? value : true);

  // Activate widgets
  BzDeck.pages = {};
  BzDeck.pages.home = new BzDeck.HomePage();
  BzDeck.toolbar = new BzDeck.Toolbar();
  BzDeck.sidebar = new BzDeck.Sidebar();
  // BzDeck.DetailsPage.swipe.init();

  // Change the theme
  if (theme && FTut.list.contains(theme)) {
    FTut.selected = theme;
  }

  // Preload images from CSS
  FTut.preload_images();
};

BzDeck.bootstrap.show_notification = function () {
  // Authorize a notification
  FlareTail.util.app.auth_notification();

  // Update UI & Show a notification
  BzDeck.core.toggle_unread_ui(true);

  // Notify requests
  BzDeck.model.get_subscription_by_id('requests').then(bugs => {
    let len = bugs.size;

    if (!len) {
      return;
    }

    let title = len > 1 ? `You have ${len} requests`
                        : 'You have 1 request'; // l10n
    let body = len > 1 ? 'Select the Requests folder to browse those bugs.'
                       : 'Select the Requests folder to browse the bug.'; // l10n

    // TODO: Improve the notification body to describe more about the requests,
    // e.g. There are 2 bugs awaiting your information, 3 patches awaiting your review.

    // Select the Requests folder when the notification is clicked
    BzDeck.core.show_notification(title, body).then(event => BzDeck.router.navigate('/home/requests'));
  });
};

BzDeck.bootstrap.finish = function () {
  // Activate the router
  BzDeck.router = new FlareTail.app.Router(BzDeck);
  BzDeck.router.locate();

  // Timer to check for updates, call every 10 minutes
  BzDeck.core.timers.set('fetch_subscriptions', window.setInterval(() => BzDeck.model.fetch_subscriptions(), 600000));

  // Register the app for an activity on Firefox OS
  BzDeck.core.register_activity_handler();

  // Connect to the push notification server
  BzDeck.bugzfeed.connect();

  BzDeck.core.show_status('Loading complete.'); // l10n
  BzDeck.session.login();
  this.processing = false;
};

/* ------------------------------------------------------------------------------------------------------------------
 * Core
 * ------------------------------------------------------------------------------------------------------------------ */

BzDeck.core = {};
BzDeck.core.timers = new Map();
BzDeck.core.notifications = new Set();

BzDeck.core.toggle_star = function (id, starred) {
  // Save in DB
  BzDeck.model.get_bug_by_id(id).then(bug => {
    if (bug && bug.comments) {
      if (!bug._starred_comments) {
        bug._starred_comments = new Set();
      }

      if (starred) {
        bug._starred_comments.add(bug.comments[0].id);
      } else {
        bug._starred_comments.clear();
      }

      BzDeck.model.save_bug(bug);
      FlareTail.util.event.trigger(window, 'Bug:StarToggled', { 'detail': { bug }});
    }
  });
};

BzDeck.core.toggle_unread = function (id, value) {
  // Save in DB
  BzDeck.model.get_bug_by_id(id).then(bug => {
    if (bug && bug._unread !== value) {
      bug._unread = value;
      BzDeck.model.save_bug(bug);
      FlareTail.util.event.trigger(window, 'Bug:UnreadToggled', { 'detail': { bug }});
    }
  });
};

BzDeck.core.toggle_unread_ui = function (loaded = false) {
  BzDeck.model.get_all_bugs().then(bugs => {
    bugs = [for (bug of bugs) if (bug._unread) bug];

    if (document.documentElement.getAttribute('data-current-tab') === 'home') {
      let unread_num = [for (bug of BzDeck.pages.home.data.bugs) if (bug._unread) bug].length;

      BzDeck.pages.home.update_window_title(
        document.title.replace(/(\s\(\d+\))?$/, unread_num ? ` (${unread_num})` : '')
      );
    }

    if (!loaded) {
      return;
    }

    if (bugs.length === 0) {
      BzDeck.core.show_status('No new bugs to download'); // l10n

      return;
    }

    bugs.sort((a, b) => new Date(b.last_change_time) - new Date(a.last_change_time));

    let status = bugs.length > 1 ? `You have ${bugs.length} unread bugs` : 'You have 1 unread bug', // l10n
        extract = [for (bug of bugs.slice(0, 3)) `${bug.id} - ${bug.summary}`].join('\n');

    BzDeck.core.show_status(status);

    // Select Inbox when the notification is clicked
    BzDeck.core.show_notification(status, extract).then(event => BzDeck.router.navigate('/home/inbox'));
  });
};

BzDeck.core.install_app = function () {
  FlareTail.util.app.install(BzDeck.config.app.manifest).then(() => {
    document.querySelector('#main-menu--app--install').setAttribute('aria-disabled', 'true');
  });
};

BzDeck.core.show_status = function (message) {
  if (this.$statusbar) {
    this.$statusbar.textContent = message;
  }
};

BzDeck.core.show_notification = function (title, body) {
  if (BzDeck.model.data.prefs['notifications.show_desktop_notifications'] === false) {
    return;
  }

  // Firefox OS requires a complete URL for the icon
  let icon = location.origin + '/static/images/logo/icon-128.png',
      notification = new Notification(title, { body, icon });

  BzDeck.core.notifications.add(notification);

  return new Promise(resolve => notification.addEventListener('click', event => resolve(event)));
};

BzDeck.core.register_activity_handler = function () {
  // Match BMO's bug detail pages.
  // TODO: Implement a handler for attachments
  let re = /^https?:\/\/(?:bugzilla\.mozilla\.org\/show_bug\.cgi\?id=|bugzil\.la\/)(\d+)$/;

  // Not implemented yet on Firefox OS nor Firefox for Android
  if (typeof navigator.mozRegisterActivityHandler === 'function') {
    navigator.mozRegisterActivityHandler({
      'name': 'view',
      'filters': {
        'type': 'url',
        'url': {
          'required': true,
          'regexp': re
        }
      }
    });
  }

  if (typeof navigator.mozSetMessageHandler === 'function') {
    navigator.mozSetMessageHandler('activity', req => {
      let match = req.source.url.match(re);

      if (match) {
        BzDeck.router.navigate('/bug/' + match[1]);
      }
    });
  }
};

BzDeck.core.parse_comment = function (str) {
  let blockquote = p => {
    let regex = /^&gt;\s?/gm;

    if (!p.match(regex)) {
      return p;
    }

    let lines = p.split(/\n/),
        quote = [];

    for (let [i, line] of lines.entries()) {
      if (line.match(regex)) {
        // A quote start
        quote.push(line);
      }

      if ((!line.match(regex) || !lines[i + 1]) && quote.length) {
        // A quote end, the next line is not a part of the quote, or no more lines
        let quote_str = quote.join('\n'),
            quote_repl = quote_str.replace(regex, '');

        if (quote_repl.match(regex)) {
          // Nested quote(s) found, do recursive processing
          quote_repl = blockquote(quote_repl);
        }

        for (let p of quote_repl.split(/\n{2,}/)) {
          quote_repl = quote_repl.replace(p, `<p>${p}</p>`);
        }

        p = p.replace(quote_str, `<blockquote>${quote_repl}</blockquote>`);
        quote = [];
      }
    }

    return p;
  };

  str = FlareTail.util.string.sanitize(str);

  // Quotes
  for (let p of str.split(/\n{2,}/)) {
    str = str.replace(p, `<p>${blockquote(p)}</p>`);
  }

  str = str.replace(/\n{2,}/gm, '').replace(/\n/gm, '<br>');

  // General links
  str = str.replace(
    /((https?|feed|ftps?|ircs?|mailto|news):(?:\/\/)?[\w-]+(\.[\w-]+)+((&amp;|[\w.,@?^=%$:\/~+#-])*(&amp;|[\w@?^=%$\/~+#-]))?)/gm,
    '<a href="$1">$1</a>'
  );

  // Email links
  // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address
  str = str.replace(
    /^([a-zA-Z0-9.!#$%&\'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/,
    '<a href="mailto:$1">$1</a>'
  );

  // Bugs
  str = str.replace(
    /Bug\s*#?(\d+)/igm,
    '<a href="/bug/$1" data-bug-id="$1">Bug $1</a>' // l10n
  );

  // Attachments
  str = str.replace(
    /Attachment\s*#?(\d+)/igm,
    '<a href="/attachment/$1" data-attachment-id="$1">Attachment $1</a>' // l10n
  );

  return str;
};

BzDeck.core.get_name = function (person) {
  return person.real_name || person.email;
};

BzDeck.core.get_user_color = function (person) {
  return '#' + String(person.real_name ? person.real_name.length : 0).substr(-1, 1)
             + String(person.name.length).substr(-1, 1) + String(person.name.length).substr(0, 1);
};

BzDeck.core.update_window_title = $tab => {
  if ($tab.id === 'tab-home') {
    BzDeck.pages.home.update_window_title($tab.title);
  } else {
    document.title = $tab.title.replace('\n', ' – ');
    document.querySelector('[role="banner"] h1').textContent = $tab.textContent;
  }
};

/* ------------------------------------------------------------------------------------------------------------------
 * Services
 * ------------------------------------------------------------------------------------------------------------------ */

BzDeck.services = {};

BzDeck.services.Gravatar = function Gravatar (email) {
  this.hash = md5(email);
  this.avatar_url = this.endpoint + '/avatar/' + this.hash + '?s=160&d=mm';
  this.profile_url = this.endpoint + '/' + this.hash + '.json';
};

BzDeck.services.Gravatar.prototype.endpoint = 'https://secure.gravatar.com';

BzDeck.services.Gravatar.prototype.get_profile = function () {
  return new Promise(resolve => FlareTail.util.network.jsonp(this.profile_url).then(data => resolve(data.entry[0])));
};

/* ------------------------------------------------------------------------------------------------------------------
 * Session
 * ------------------------------------------------------------------------------------------------------------------ */

BzDeck.session = {};

BzDeck.session.login = function () {
  let $app_login = document.querySelector('#app-login'),
      $app_body = document.querySelector('#app-body');

  BzDeck.core.$statusbar = document.querySelector('#statusbar');

  $app_login.setAttribute('aria-hidden', 'true');
  $app_body.removeAttribute('aria-hidden');

  // TODO: focus handling
};

BzDeck.session.logout = function () {
  let $app_login = document.querySelector('#app-login'),
      $app_body = document.querySelector('#app-body');

  BzDeck.core.$statusbar = $app_login.querySelector('[role="status"]');
  BzDeck.core.show_status('You have logged out.'); // l10n

  $app_login.removeAttribute('aria-hidden');
  $app_body.setAttribute('aria-hidden', 'true');

  BzDeck.bootstrap.show_login_form(false);

  BzDeck.session.clean();

  // Delete the account data
  BzDeck.model.data.account.active = false;
  BzDeck.model.save_account(BzDeck.model.data.account);

  delete BzDeck.model.data.account;
};

BzDeck.session.clean = function () {
  // Terminate timers
  for (let timer of BzDeck.core.timers.values()) {
    window.clearInterval(timer);
  }

  BzDeck.core.timers.clear();

  // Destroy all notifications
  for (let notification of BzDeck.core.notifications) {
    notification.close()
  };

  BzDeck.core.notifications.clear();

  // Disconnect from the Bugzfeed server
  BzDeck.bugzfeed.disconnect();
}

/* ------------------------------------------------------------------------------------------------------------------
 * Events
 * ------------------------------------------------------------------------------------------------------------------ */

window.addEventListener('DOMContentLoaded', event => {
  BzDeck.bootstrap.processing = true;

  if (FlareTail.util.compatible) {
    BzDeck.bootstrap.start();
  }
});

window.addEventListener('beforeunload', event => {
  BzDeck.session.clean();
});

window.addEventListener('popstate', event => {
  // Hide sidebar
  if (FlareTail.util.device.type === 'mobile-phone') {
    document.documentElement.setAttribute('data-sidebar-hidden', 'true');
    document.querySelector('#sidebar').setAttribute('aria-hidden', 'true');
  }
});

window.addEventListener('online', event => {
  BzDeck.bugzfeed.connect();
});

window.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('dragenter', event => event.preventDefault());
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
window.addEventListener('wheel', event => event.preventDefault());

window.addEventListener('click', event => {
  let $target = event.target;

  // Discard clicks on the fullscreen dialog
  if ($target === document) {
    return true;
  }

  if ($target.matches('[itemtype="http://schema.org/Person"]')) {
    BzDeck.router.navigate('/profile/' + $target.properties.email[0].itemValue);
    event.stopPropagation();
    event.preventDefault();

    return false;
  }

  if ($target.matches(':link')) {
    // Bug link: open in a new app tab
    if ($target.hasAttribute('data-bug-id')) {
      BzDeck.router.navigate('/bug/' + $target.getAttribute('data-bug-id'));

      event.preventDefault();

      return false;
    }

    // Attachment link: open in a new browser tab (TEMP)
    if ($target.hasAttribute('data-attachment-id')) {
      window.open(BzDeck.model.data.server.url + '/attachment.cgi?id='
                   + $target.getAttribute('data-attachment-id'), '_blank');

      event.preventDefault();

      return false;
    }

    // Normal link: open in a new browser tab
    $target.target = '_blank';

    return false;
  }

  return true;
});

window.addEventListener('Bug:UnreadToggled', event => {
  BzDeck.core.toggle_unread_ui();
});
