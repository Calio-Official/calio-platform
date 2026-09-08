// CALIO Platform: Global Site Navigation & Chrome Extension Pop-up Controller

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Nav Drawer
  const btnOpenNav = document.getElementById('btnOpenMobileNav');
  const btnCloseNav = document.getElementById('btnCloseMobileNav');
  const mobileDrawer = document.getElementById('mobileDrawer');

  if (btnOpenNav && mobileDrawer) {
    btnOpenNav.addEventListener('click', () => {
      mobileDrawer.classList.add('is-open');
    });
  }
  if (btnCloseNav && mobileDrawer) {
    btnCloseNav.addEventListener('click', () => {
      mobileDrawer.classList.remove('is-open');
    });
  }

  // Chrome Extension Overview Modal
  const modalBackdrop = document.getElementById('extModalBackdrop');
  const btnModalClose = document.getElementById('btnExtModalClose');
  const btnModalDismiss = document.getElementById('btnExtModalDismiss');
  const modalTriggers = document.querySelectorAll('[data-open-ext-modal="true"]');

  function openModal() {
    if (modalBackdrop) {
      modalBackdrop.classList.add('is-visible');
      modalBackdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(setSessionFlag = true) {
    if (modalBackdrop) {
      modalBackdrop.classList.remove('is-visible');
      modalBackdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (setSessionFlag) {
        try {
          sessionStorage.setItem('calio_ext_modal_dismissed', '1');
        } catch (e) {}
      }
    }
  }

  if (btnModalClose) {
    btnModalClose.addEventListener('click', () => closeModal(true));
  }
  if (btnModalDismiss) {
    btnModalDismiss.addEventListener('click', () => closeModal(true));
  }

  // Backdrop click to close
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeModal(true);
      }
    });
  }

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop && modalBackdrop.classList.contains('is-visible')) {
      closeModal(true);
    }
  });

  // Attach click to all trigger buttons
  modalTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      if (!e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        openModal();
      }
    });
  });

  // Hero ticker buttons: quick switch in terminal and smooth scroll
  document.querySelectorAll('.hero-ticker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ticker = btn.getAttribute('data-ticker');
      const wtBtn = document.querySelector(`[data-wt-ticker="${ticker}"]`);
      if (wtBtn) {
        wtBtn.click();
      }
      document.querySelectorAll('.hero-ticker-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      const termEl = document.getElementById('terminal');
      if (termEl) {
        termEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Automatically prompt once per session after 2.8 seconds
  try {
    const isDismissed = sessionStorage.getItem('calio_ext_modal_dismissed');
    if (!isDismissed) {
      setTimeout(() => {
        openModal();
      }, 2800);
    }
  } catch (e) {}
});
