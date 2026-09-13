/**
 * ZeoSpec Meet & MeetManager - Zero-Dependency Universal SVG Icon System
 * Eliminates 1.13MB Google Fonts webfont, FOUT, and missing ligature text fallbacks.
 * Works 100% offline, in standalone PWA mode, and on mobile cellular data.
 */
(function() {
  'use strict';

  var ICON_PATHS = {
    arrow_back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    arrow_downward: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
    arrow_drop_down: 'M7 10l5 5 5-5z',
    block: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z',
    calendar_today: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z',
    call: 'M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.44-5.15-3.75-6.59-6.59l1.97-1.57c.29-.29.37-.7.24-1.01-.36-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z',
    cancel: 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z',
    check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    check_circle: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    chevron_left: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
    chevron_right: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
    edit_calendar: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zm-5.7-8.12l1.41 1.41-4.71 4.71H8.59v-1.41l4.71-4.71zm3.83-1.41c-.2-.2-.51-.2-.71 0l-1.13 1.13 1.41 1.41 1.13-1.13c.2-.2.2-.51 0-.71l-.7-.7z',
    error: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    event_available: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zm-8.47-3.03l5.65-5.66 1.42 1.42-7.07 7.07-3.54-3.53 1.42-1.42 2.12 2.12z',
    event_busy: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9.59 16.59L12 14.18l2.41 2.41 1.41-1.41L13.41 12.77 15.82 10.36 14.41 8.95 12 11.36 9.59 8.95 8.18 10.36l2.41 2.41-2.41 2.41 1.41 1.41z',
    group: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    install_mobile: 'M17 18H7V6h10v1h2V3c0-1.1-.9-2-2-2H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-4h-2v1zm-5-3.5l3.5-3.5H13V7h-2v4H8.5L12 14.5z',
    key: 'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
    lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
    logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
    mail: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    open_in_new: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    password: 'M2 17h20v2H2v-2zm1.15-4.05L4 11.47l.85 1.48 1.3-.75-.85-1.48H7v-1.5H5.3l.85-1.47L4.85 7 4 8.47 3.15 7l-1.3.75.85 1.47H1v1.5h1.7l-.85 1.48 1.3.75zm8 0l.85-1.48.85 1.48 1.3-.75-.85-1.48H15v-1.5h-1.7l.85-1.47L12.85 7l-.85 1.47L11.15 7l-1.3.75.85 1.47H9v1.5h1.7l-.85 1.48 1.3.75zm8 0l.85-1.48.85 1.48 1.3-.75-.85-1.48H23v-1.5h-1.7l.85-1.47L20.85 7l-.85 1.47L19.15 7l-1.3.75.85 1.47H17v1.5h1.7l-.85 1.48 1.3.75z',
    pending: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-5 11c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
    pending_actions: 'M17 12c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm1.65 7.35L16.5 17.2V14h1.5v2.55l1.8 1.8-1.15 1zm-4.65-9.35H6V8h8v2zm-2 4H6v-2h6v2zm6-10H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h6.1c-.06-.32-.1-.66-.1-1 0-3.31 2.69-6 6-6 .84 0 1.63.18 2.36.49l.64-.64V6c0-1.1-.9-2-2-2zm0 2v3H5V4h14z',
    person_add: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    phone_disabled: 'M1.41 1.69L0 3.1l4.41 4.41c-.15.54-.23 1.1-.23 1.68 0 9.28 7.73 17 17.01 17 .58 0 1.14-.08 1.68-.23L20.89 24l1.41-1.41L1.41 1.69zM16.5 15.57l2.87 2.87c-.45.34-.94.61-1.47.81-2.83-1.44-5.15-3.75-6.59-6.59.2-.53.47-1.02.81-1.47l2.87 2.87c.29.29.37.7.24 1.01-.36 1.11-.56 2.3-.56 3.53 0 .54.45.99.99.99h3.45c.54 0 .99-.45.99-.99 0-1.23-.2-2.42-.56-3.53-.13-.31-.05-.72.24-1.01zM21 16.48v-1.1c0-.54-.45-.99-.99-.99-1.23 0-2.42-.2-3.53-.56-.27-.09-.58-.02-.8.17l-1.8 1.8-3.03-3.03 1.8-1.8c.19-.22.26-.53.17-.8-.36-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H7.22l8.28 8.28L21 16.48z',
    public: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    schedule: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    sync: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
    task_alt: 'M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM19.79 10.22C19.92 10.79 20 11.39 20 12c0 4.41-3.59 8-8 8s-8-3.59-8-8 3.59-8 8-8c1.7 0 3.27.53 4.56 1.44l1.46-1.46C16.27 2.74 14.23 2 12 2 6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-1.19-.22-2.33-.6-3.39l-1.61 1.61z',
    videocam: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
    visibility: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
    visibility_off: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
    warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'
  };

  /**
   * Generates an SVG icon element string with appropriate classes and accessibility attributes.
   */
  function getZeoIconSvg(name, extraClasses, extraAttrs) {
    var path = ICON_PATHS[name] || ICON_PATHS['info'];
    var cls = 'zeo-svg-icon shrink-0 inline-block align-middle ' + (extraClasses || '');
    var attrs = extraAttrs ? ' ' + extraAttrs : '';
    return '<svg class="' + cls.trim() + '" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"' + attrs + '><path d="' + path + '"/></svg>';
  }

  /**
   * Scans container and replaces any .material-symbols-outlined element with its SVG equivalent.
   */
  function replaceMaterialSymbols(container) {
    var root = container || document;
    var elements = root.querySelectorAll('.material-symbols-outlined');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var iconName = (el.getAttribute('data-icon') || el.textContent || '').trim();
      if (!iconName || !ICON_PATHS[iconName]) continue;

      // Retain existing classes, replace font ligature with SVG
      var classes = el.className.replace(/material-symbols-outlined/g, '').trim();
      var idAttr = el.id ? ' id="' + el.id + '"' : '';
      var svgHtml = getZeoIconSvg(iconName, classes, idAttr);

      var span = document.createElement('span');
      span.className = 'zeo-icon-wrapper inline-flex items-center justify-center ' + (el.className.includes('absolute') ? 'absolute' : '');
      span.innerHTML = svgHtml;
      
      // Preserve ID and events if any
      if (el.id) {
        var svgEl = span.querySelector('svg');
        if (svgEl) svgEl.id = el.id;
      }
      if (el.parentNode) {
        el.parentNode.replaceChild(span.firstElementChild || span, el);
      }
    }
  }

  // Export globally
  window.ZE_ICONS = ICON_PATHS;
  window.getZeoIconSvg = getZeoIconSvg;
  window.replaceMaterialSymbols = replaceMaterialSymbols;

  // Run automatically on load and watch dynamic changes
  function initIcons() {
    replaceMaterialSymbols(document.body || document.documentElement);
    
    // MutationObserver to catch dynamically added ligature spans
    if (window.MutationObserver) {
      var observer = new MutationObserver(function(mutations) {
        for (var m = 0; m < mutations.length; m++) {
          var mutation = mutations[m];
          for (var n = 0; n < mutation.addedNodes.length; n++) {
            var node = mutation.addedNodes[n];
            if (node.nodeType === 1) {
              if (node.classList && node.classList.contains('material-symbols-outlined')) {
                replaceMaterialSymbols(node.parentNode || document.body);
              } else if (node.querySelectorAll) {
                replaceMaterialSymbols(node);
              }
            }
          }
        }
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIcons);
  } else {
    initIcons();
  }
})();
