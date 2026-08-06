/* BlueConnect — landing page behaviour.
   Mobile nav, sticky nav state, and lead-form submission.

   The form captures a lead and notifies the team. It does not create an
   account, a tenant, or a connection, and it never touches WhatsApp. */

(function () {
  'use strict';

  /* ---- Mobile nav ------------------------------------------------------ */

  var toggle = document.getElementById('nav-toggle');
  var menu = document.getElementById('nav-menu');
  var nav = document.getElementById('nav');

  if (toggle && menu) {
    var setOpen = function (open) {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    var isOpen = function () {
      return toggle.getAttribute('aria-expanded') === 'true';
    };

    toggle.addEventListener('click', function () {
      setOpen(!isOpen());
    });

    // Close on link click (anchors navigate within the same page).
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    // Close on Escape, returning focus to the toggle.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });

    // Close on outside click.
    document.addEventListener('click', function (event) {
      if (!isOpen()) return;
      if (!menu.contains(event.target) && !toggle.contains(event.target)) {
        setOpen(false);
      }
    });

    // Reset state when the layout crosses back to desktop.
    var desktop = window.matchMedia('(min-width: 861px)');
    var onChange = function (event) {
      if (event.matches) setOpen(false);
    };
    if (desktop.addEventListener) desktop.addEventListener('change', onChange);
    else desktop.addListener(onChange); // Safari < 14
  }

  /* ---- Sticky nav shadow ----------------------------------------------- */

  if (nav) {
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.position = 'absolute';
    sentinel.style.top = '0';
    sentinel.style.left = '0';
    sentinel.style.width = '1px';
    sentinel.style.height = '1px';
    sentinel.style.overflow = 'hidden';
    sentinel.style.pointerEvents = 'none';
    document.body.prepend(sentinel);

    new IntersectionObserver(function (entries) {
      nav.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* ---- Lead form -------------------------------------------------------
     Progressive enhancement: with JS off the form is a plain POST to the
     endpoint. This only upgrades it to an inline confirmation. */

  var form = document.getElementById('lead-form');
  var confirmEl = document.getElementById('form-confirm');
  var errorEl = document.getElementById('form-error');

  if (form && confirmEl && errorEl) {
    var submitBtn = form.querySelector('[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.textContent.trim() : 'Request access';

    var showConfirm = function () {
      form.hidden = true;
      confirmEl.classList.add('is-visible');
      confirmEl.focus();
    };

    var fail = function (message) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    };

    // Lets the confirmation state be reviewed without a live endpoint:
    // open index.html?preview=confirm
    if (window.location.search.indexOf('preview=confirm') !== -1) showConfirm();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      errorEl.classList.remove('is-visible');

      if (!form.reportValidity()) return;

      // Honeypot tripped — accept silently, send nothing.
      var honeypot = form.querySelector('[name="_gotcha"]');
      if (honeypot && honeypot.value) {
        showConfirm();
        return;
      }

      // Refuse to fake a success while the endpoint is still a placeholder.
      if (form.action.indexOf('YOUR_FORM_ID') !== -1) {
        fail('This form isn’t connected to a submission endpoint yet, so nothing was sent. ' +
             'Replace YOUR_FORM_ID in index.html before launch.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(function (response) {
          if (!response.ok) throw new Error('Request failed: ' + response.status);
          showConfirm();
        })
        .catch(function () {
          fail('Something went wrong sending that. Please try again in a moment.');
        })
        .then(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
          }
        });
    });
  }
})();
