(function () {
  'use strict';

  var NAME_PATTERN = /^[A-Za-z][A-Za-z\s\-'.]{1,49}$/;
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('newsletter-form');
    if (!form) return;

    var endpoint = form.getAttribute('data-endpoint') || '';
    var reference = form.getAttribute('data-reference') || 'zeospec.com';
    var submitBtn = form.querySelector('[type="submit"]');
    var messageEl = document.getElementById('newsletter-form-message');
    var inputs = form.querySelectorAll('input:not([type="hidden"]):not(.c-subscribe__honeypot)');

    // Clear status and field errors when user edits fields
    inputs.forEach(function (input) {
      input.addEventListener('input', function () {
        clearFieldErrors(form);
        if (messageEl && !messageEl.hidden) {
          clearFormMessage(messageEl);
        }
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearFieldErrors(form);
      clearFormMessage(messageEl);

      var honey = form.honey ? form.honey.value : '';
      var firstName = form.firstName ? form.firstName.value.trim() : '';
      var lastName = form.lastName ? form.lastName.value.trim() : '';
      var email = form.email ? form.email.value.trim() : '';

      // 1. Honeypot Bot Detection
      // Bots fill every input they encounter; humans never see this field.
      // If filled, silently fake a success response without calling the API.
      if (honey) {
        showFormMessage(messageEl, 'Thank you! You are now subscribed.', 'success');
        form.reset();
        return;
      }

      // 2. Client-side field validations
      if (!firstName) {
        showFieldError(form, 'firstName', 'First name is required.');
        showFormMessage(messageEl, 'Please enter your first name.', 'error');
        focusField(form, 'firstName');
        return;
      }
      if (!NAME_PATTERN.test(firstName)) {
        showFieldError(form, 'firstName', 'Enter a valid first name (letters only, 2–50 characters).');
        showFormMessage(messageEl, 'Please enter a valid first name.', 'error');
        focusField(form, 'firstName');
        return;
      }

      if (!lastName) {
        showFieldError(form, 'lastName', 'Last name is required.');
        showFormMessage(messageEl, 'Please enter your last name.', 'error');
        focusField(form, 'lastName');
        return;
      }
      if (!NAME_PATTERN.test(lastName)) {
        showFieldError(form, 'lastName', 'Enter a valid last name (letters only, 2–50 characters).');
        showFormMessage(messageEl, 'Please enter a valid last name.', 'error');
        focusField(form, 'lastName');
        return;
      }

      if (!email) {
        showFieldError(form, 'email', 'Email address is required.');
        showFormMessage(messageEl, 'Please enter your email address.', 'error');
        focusField(form, 'email');
        return;
      }
      if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
        showFieldError(form, 'email', 'Enter a valid email address.');
        showFormMessage(messageEl, 'Please provide a valid email address.', 'error');
        focusField(form, 'email');
        return;
      }

      if (!endpoint || endpoint.trim() === '') {
        showFormMessage(messageEl, 'Newsletter API endpoint is not configured yet. Please try again later.', 'warning');
        return;
      }

      var payload = {
        email: email.toLowerCase(),
        firstName: firstName,
        lastName: lastName,
        reference: reference
      };

      // 3. Set UI Loading State
      var originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      setSubmitting(form, submitBtn, true, 'Subscribing...');

      // 4. 15-second AbortController timeout protection
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeoutId = null;
      if (controller) {
        timeoutId = setTimeout(function () {
          controller.abort();
        }, 15000);
      }

      // 5. Submit to Google Apps Script Web App Endpoint
      // Important: Content-Type must be 'text/plain;charset=utf-8' to avoid
      // CORS preflight (OPTIONS) requests that Google Apps Script Web Apps cannot handle.
      fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      })
        .then(function (response) {
          if (timeoutId) clearTimeout(timeoutId);
          return response.json();
        })
        .then(function (data) {
          if (data && data.status === 'success') {
            // In-place Success: No redirect away, keeps user engaged on page
            showFormMessage(messageEl, data.message || 'Thank you for subscribing! Your submission has been received.', 'success');
            form.reset();

            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.innerHTML = '<i class="ion ion-ios-checkmark-circle" style="margin-right: 6px;"></i><span>Subscribed!</span>';
              setTimeout(function () {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
              }, 4000);
            }
          } else {
            var errorMsg = (data && data.message) || 'Unable to process subscription. Please try again.';
            showFormMessage(messageEl, errorMsg, 'error');
            if (data && data.field) {
              showFieldError(form, data.field, errorMsg);
            }
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalBtnHtml;
            }
          }
        })
        .catch(function (error) {
          if (timeoutId) clearTimeout(timeoutId);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
          }

          if (error && error.name === 'AbortError') {
            showFormMessage(messageEl, 'Request timed out. Please check your internet connection and try again.', 'error');
          } else {
            showFormMessage(messageEl, 'Unable to reach the subscription service. Please verify your connection or try again shortly.', 'error');
          }
        })
        .finally(function () {
          form.classList.remove('c-subscribe__form--submitting');
        });
    });
  });

  function focusField(form, field) {
    var el = form.querySelector('[name="' + field + '"]');
    if (el) el.focus();
  }

  function showFieldError(form, field, message) {
    var input = form.querySelector('[name="' + field + '"]');
    if (!input) return;
    input.classList.add('c-subscribe__form-email--invalid');
    input.setAttribute('aria-invalid', 'true');

    var errorId = 'newsletter-error-' + field;
    var errorEl = document.getElementById(errorId);
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.id = errorId;
      errorEl.className = 'c-subscribe__field-error';
      errorEl.setAttribute('role', 'alert');
      input.insertAdjacentElement('afterend', errorEl);
    }
    errorEl.textContent = message;
    input.setAttribute('aria-describedby', errorId);
  }

  function clearFieldErrors(form) {
    form.querySelectorAll('.c-subscribe__form-email--invalid').forEach(function (input) {
      input.classList.remove('c-subscribe__form-email--invalid');
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    });
    form.querySelectorAll('.c-subscribe__field-error').forEach(function (el) {
      el.remove();
    });
  }

  function showFormMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'c-subscribe__form-message c-subscribe__form-message--' + type;
    el.hidden = false;
  }

  function clearFormMessage(el) {
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
    el.className = 'c-subscribe__form-message';
  }

  function setSubmitting(form, button, isSubmitting, loadingText) {
    form.classList.toggle('c-subscribe__form--submitting', isSubmitting);
    if (button) {
      button.disabled = isSubmitting;
      button.setAttribute('aria-busy', isSubmitting ? 'true' : 'false');
      if (isSubmitting && loadingText) {
        button.innerHTML = '<i class="ion ion-ios-sync" style="display:inline-block; animation: spin 1s linear infinite; margin-right: 6px;"></i><span>' + loadingText + '</span>';
      }
    }
  }
})();
