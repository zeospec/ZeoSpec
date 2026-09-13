document.addEventListener("DOMContentLoaded", function () {
  'use strict';

  /* =======================
  // Menu
  ======================= */
  /* =======================
  // Mobile Menu & Navigation
  ======================= */
  const body = document.querySelector("body");
  const menuToggleBtn = document.getElementById("menu-toggle-btn") || document.querySelector(".nav-button");
  const menuCloseBtn = document.querySelector(".nav__icon-close");
  const menuList = document.getElementById("primary-navigation") || document.querySelector(".main-nav");
  const navBackdrop = document.getElementById("nav-backdrop");

  if (menuToggleBtn && menuList) {
    const nav = menuList;

    function menuOpen() {
      menuList.classList.add("is-open");
      body.classList.add("menu-open");
      nav.setAttribute("aria-hidden", "false");
      menuToggleBtn.setAttribute("aria-expanded", "true");
      if (navBackdrop) {
        navBackdrop.classList.add("is-active");
        navBackdrop.setAttribute("aria-hidden", "false");
      }
    }

    function menuClose() {
      menuList.classList.remove("is-open");
      body.classList.remove("menu-open");
      nav.setAttribute("aria-hidden", "true");
      menuToggleBtn.setAttribute("aria-expanded", "false");
      if (navBackdrop) {
        navBackdrop.classList.remove("is-active");
        navBackdrop.setAttribute("aria-hidden", "true");
      }
    }

    menuToggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuList.classList.contains("is-open")) {
        menuClose();
      } else {
        menuOpen();
      }
    });

    if (menuCloseBtn) {
      menuCloseBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        menuClose();
      });
    }

    if (navBackdrop) {
      navBackdrop.addEventListener("click", function () {
        menuClose();
      });
    }

    // Close menu when clicking outside
    document.addEventListener("click", function (e) {
      if (menuList.classList.contains("is-open") && !menuList.contains(e.target) && !menuToggleBtn.contains(e.target)) {
        menuClose();
      }
    });

    // Close menu on Escape key
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuList.classList.contains("is-open")) {
        menuClose();
        menuToggleBtn.focus();
      }
    });

    // Close menu when clicking regular navigation links on mobile
    menuList.querySelectorAll(".nav__link:not(.dropdown-toggle)").forEach(link => {
      link.addEventListener("click", () => {
        if (window.innerWidth <= 1024) {
          menuClose();
        }
      });
    });

    // Support mobile dropdown submenu accordion
    menuList.querySelectorAll(".dropdown-toggle").forEach(toggle => {
      toggle.addEventListener("click", function (e) {
        if (window.innerWidth <= 1024) {
          e.preventDefault();
          const parent = this.closest(".dropdown");
          if (parent) {
            parent.classList.toggle("is-expanded");
            const expanded = parent.classList.contains("is-expanded");
            this.setAttribute("aria-expanded", expanded ? "true" : "false");
          }
        }
      });
    });
  }

  /* =======================
  // Animation Load Page
  ======================= */
  setTimeout(function(){
    body.classList.add("is-in");
  },150)

  /* ==================================
  // Stop Animations After All Have Run
  ================================== */
  setTimeout(function(){
    body.classList.add("stop-animations");
  },1500)

  /* ======================================
  // Stop Animations During Window Resizing
  ====================================== */
  let resizeTimer;
  window.addEventListener("resize", () => {
    document.body.classList.add("resize-animation-stopper");
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      document.body.classList.remove("resize-animation-stopper");
    }, 300);
  });


  /* =======================
  // Responsive Videos
  ======================= */
  reframe(".post__content iframe:not(.reframe-off), .page__content iframe:not(.reframe-off)");


  /* =======================
  // Zoom Image
  ======================= */
  const lightense = document.querySelector(".page img, .post img"),
  imageLink = document.querySelectorAll(".page a img, .post a img");

  if (imageLink) {
    for (var i = 0; i < imageLink.length; i++) imageLink[i].parentNode.classList.add("image-link");
    for (var i = 0; i < imageLink.length; i++) imageLink[i].classList.add("no-lightense");
  }

  if (lightense) {
    Lightense(".page img:not(.no-lightense), .post img:not(.no-lightense)", {
    padding: 60,
    offset: 30
    });
  }

  /* ============================
  // Smooth scrolling to section
  ============================ */
  document.querySelectorAll(".works-button").forEach(anchor => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();

      document.querySelector(this.getAttribute("href")).scrollIntoView({
        behavior: "smooth"
      });
    });
  });


  /* ============================
  // Testimonials Slider
  ============================ */
  if (typeof tns === "function" && document.querySelector(".my-slider")) {
    var slider = tns({
      container: ".my-slider",
      items: 3,
      slideBy: 1,
      gutter: 20,
      nav: false,
      mouseDrag: true,
      autoplay: false,
      controlsContainer: "#customize-controls",
      responsive: {
        1024: {
          items: 3,
        },
        768: {
          items: 2,
        },
        0: {
          items: 1,
        }
      }
    });
  }


  /* ============================
  // iTyped
  ============================ */
  if (document.querySelector(".c-subscribe")) {
    var options = {
      strings: itype_text,
      typeSpeed: 100,
      backSpeed: 50,
      startDelay: 200,
      backDelay: 1500,
      loop: true,
      showCursor: true,
      cursorChar: "|",
      onFinished: function(){}
    }

    ityped.init('#ityped', options);
  }


  /* ============================
  // Sticky Header, Reading Progress & Scroll to top
  ============================ */
  const header = document.querySelector(".c-header");
  const btnScrollToTop = document.querySelector(".top");
  const readingProgressBar = document.getElementById("reading-progress");
  const articleContent = document.querySelector(".post__content");

  function onScroll() {
    var scrollY = window.scrollY || window.pageYOffset;
    if (header) {
      if (scrollY > 20) {
        header.classList.add("c-header--scrolled");
      } else {
        header.classList.remove("c-header--scrolled");
      }
    }
    if (btnScrollToTop) {
      if (scrollY > window.innerHeight) {
        btnScrollToTop.classList.add("is-active");
      } else {
        btnScrollToTop.classList.remove("is-active");
      }
    }
    if (readingProgressBar && articleContent) {
      const rect = articleContent.getBoundingClientRect();
      const articleTop = rect.top + scrollY;
      const articleHeight = rect.height;
      if (scrollY >= articleTop - 150) {
        readingProgressBar.classList.add("is-visible");
        const progress = Math.min(100, Math.max(0, ((scrollY - (articleTop - 150)) / (articleHeight - 150)) * 100));
        readingProgressBar.style.width = progress + "%";
      } else {
        readingProgressBar.classList.remove("is-visible");
        readingProgressBar.style.width = "0%";
      }
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (btnScrollToTop) {
    btnScrollToTop.addEventListener("click", function () {
      if (window.scrollY != 0) {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: "smooth"
        })
      }
    });
  }

  /* ============================
  // Share buttons (popups, copy, web share)
  ============================ */
  const shareList = document.querySelector('.share__list');
  if (shareList) {
    shareList.addEventListener('click', function (e) {
      const target = e.target.closest('a.share__link');
      if (!target) return;
      const platform = target.getAttribute('data-platform');
      const href = target.getAttribute('href');
      if (platform === 'copy') {
        e.preventDefault();
        const link = window.location.href;
        navigator.clipboard && navigator.clipboard.writeText(link).then(() => {
          announce('Link copied to clipboard');
        }).catch(() => {
          // Fallback
          const tmp = document.createElement('input');
          tmp.value = link;
          document.body.appendChild(tmp);
          tmp.select();
          document.execCommand('copy');
          document.body.removeChild(tmp);
          announce('Link copied to clipboard');
        });
        return;
      }
      if (platform === 'native') {
        e.preventDefault();
        if (navigator.share) {
          navigator.share({ url: window.location.href, title: document.title }).catch(() => {});
        } else {
          // fallback to copy
          const copyBtn = shareList.querySelector('.share__link.share__copy');
          if (copyBtn) copyBtn.click();
        }
        return;
      }
      if (platform === 'instagram') {
        e.preventDefault();
        const link = window.location.href;
        if (navigator.share) {
          navigator.share({ title: document.title, url: link }).catch(() => {});
        } else {
          navigator.clipboard && navigator.clipboard.writeText(link).then(() => {
            announce('Link copied to clipboard! Paste into Instagram to share');
          }).catch(() => {});
          window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
        }
        if (window.gtag) {
          window.gtag('event', 'share_click', { 'platform': 'instagram', 'page_location': window.location.href });
        }
        return;
      }
      if (href && (
        platform === 'twitter' || platform === 'facebook' || platform === 'linkedin' ||
        platform === 'whatsapp' || platform === 'telegram'
      )) {
        e.preventDefault();
        const w = 600, h = 500;
        const y = window.top.outerHeight / 2 + window.top.screenY - ( h / 2);
        const x = window.top.outerWidth / 2 + window.top.screenX - ( w / 2);
        window.open(href, 'share', `popup,left=${x},top=${y},width=${w},height=${h},toolbar=0,resizable=1,noopener,noreferrer`);
        if (window.gtag) {
          window.gtag('event', 'share_click', { 'platform': platform, 'page_location': window.location.href });
        }
      }
    });
  }
  /* ============================
  // 1-Click Code Block Copy
  ============================ */
  document.querySelectorAll('.post__content pre, .page__content pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-code-btn';
    copyBtn.type = 'button';
    copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
    copyBtn.textContent = 'Copy';

    copyBtn.addEventListener('click', () => {
      const textToCopy = code.innerText || code.textContent;
      const onCopied = () => {
        copyBtn.textContent = 'Copied! ✓';
        copyBtn.classList.add('is-copied');
        announce('Code copied to clipboard');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('is-copied');
        }, 2000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(onCopied).catch(() => {
          fallbackCopy(textToCopy, onCopied);
        });
      } else {
        fallbackCopy(textToCopy, onCopied);
      }
    });

    pre.appendChild(copyBtn);
  });

  function fallbackCopy(text, callback) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      callback();
    } catch (err) {}
    document.body.removeChild(textarea);
  }

  function announce(message) {
    let region = document.getElementById('sr-announce');
    if (!region) {
      region = document.createElement('div');
      region.id = 'sr-announce';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      region.style.position = 'absolute';
      region.style.width = '1px';
      region.style.height = '1px';
      region.style.margin = '-1px';
      region.style.border = '0';
      region.style.padding = '0';
      region.style.clip = 'rect(0 0 0 0)';
      region.style.overflow = 'hidden';
      document.body.appendChild(region);
    }
    region.textContent = message;
  }

});