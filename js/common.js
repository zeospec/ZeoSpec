document.addEventListener("DOMContentLoaded", function () {
  'use strict';

  /* =======================
  // Menu
  ======================= */
  const body = document.querySelector("body");
  const menuOpenIcon = document.querySelector(".nav__icon-menu");
  const menuCloseIcon = document.querySelector(".nav__icon-close");
  const menuList = document.querySelector(".main-nav");

  // Security: Validate elements exist before adding event listeners
  if (menuOpenIcon && menuCloseIcon && menuList) {
    const nav = document.getElementById('primary-navigation');

  menuOpenIcon.addEventListener("click", () => {
    menuOpen();
  });

  menuCloseIcon.addEventListener("click", () => {
    menuClose();
  });

  function menuOpen() {
    menuList.classList.add("is-open");
    if (nav) {
      nav.setAttribute('aria-hidden', 'false');
    }
    menuOpenIcon.setAttribute('aria-expanded', 'true');
  }

  function menuClose() {
    menuList.classList.remove("is-open");
    if (nav) {
      nav.setAttribute('aria-hidden', 'true');
    }
    menuOpenIcon.setAttribute('aria-expanded', 'false');
  }
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
  if (document.querySelector(".my-slider")) {
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
  // Scroll to top
  ============================ */
  const btnScrollToTop = document.querySelector(".top");

  window.addEventListener("scroll", function () {
    window.scrollY > window.innerHeight ? btnScrollToTop.classList.add("is-active") : btnScrollToTop.classList.remove("is-active");
  });

  btnScrollToTop.addEventListener("click", function () {
    if (window.scrollY != 0) {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth"
      })
    }
  });

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
      if (href && (
        platform === 'twitter' || platform === 'facebook' || platform === 'pinterest' || platform === 'linkedin' ||
        platform === 'whatsapp' || platform === 'telegram' || platform === 'reddit' || platform === 'pocket'
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