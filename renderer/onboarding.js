// Onboarding bei Spielstart + Erststart-Assistent.

let onboardingOpen = false;
let dismissedThisSession = false;
let firstRunStep = 1;
const FIRST_RUN_STEPS = 3;

function showOnboarding() {
  const el = document.getElementById('onboarding');
  if (!el) return;
  onboardingOpen = true;
  el.classList.remove('hidden');
  window.overlay?.setClickThrough(false);
}

function hideOnboarding() {
  const el = document.getElementById('onboarding');
  if (!el) return;
  onboardingOpen = false;
  dismissedThisSession = true;
  el.classList.add('hidden');
}

function applyOnboardingChoices() {
  const diff = parseInt(document.getElementById('ob-difficulty')?.value || '3', 10);
  state.visible = diff;
  const evSel = document.getElementById('evidence-count');
  if (evSel) evSel.value = String(diff);
  hideOnboarding();
  render();
}

function populateOnboardingSelects() {
  const diffSel = document.getElementById('ob-difficulty');
  if (diffSel) diffSel.value = String(state.visible);
}

function showFirstRun() {
  const el = document.getElementById('first-run');
  if (!el) return;
  firstRunStep = 1;
  updateFirstRunStep();
  el.classList.remove('hidden');
  window.overlay?.setClickThrough(false);
}

function hideFirstRun() {
  document.getElementById('first-run')?.classList.add('hidden');
}

function updateFirstRunStep() {
  for (let i = 1; i <= FIRST_RUN_STEPS; i++) {
    document.getElementById('fr-step-' + i)?.classList.toggle('hidden', i !== firstRunStep);
  }
  const back = document.getElementById('fr-back');
  const next = document.getElementById('fr-next');
  if (back) back.classList.toggle('hidden', firstRunStep <= 1);
  if (next) next.textContent = firstRunStep >= FIRST_RUN_STEPS ? 'Fertig' : 'Weiter';
}

function finishFirstRun() {
  const diff = parseInt(document.getElementById('fr-difficulty')?.value || '3', 10);
  state.visible = diff;
  const evSel = document.getElementById('evidence-count');
  if (evSel) evSel.value = String(diff);
  window.overlay?.setConfig({ firstRunComplete: true });
  hideFirstRun();
  render();
}

function wireFirstRun() {
  document.getElementById('fr-next')?.addEventListener('click', () => {
    if (firstRunStep >= FIRST_RUN_STEPS) {
      finishFirstRun();
      return;
    }
    firstRunStep++;
    updateFirstRunStep();
  });
  document.getElementById('fr-back')?.addEventListener('click', () => {
    if (firstRunStep > 1) {
      firstRunStep--;
      updateFirstRunStep();
    }
  });
}

async function maybeShowFirstRun() {
  if (!window.overlay?.getConfig) return;
  try {
    const cfg = await window.overlay.getConfig();
    if (!cfg.firstRunComplete) showFirstRun();
  } catch (_) {}
}

function wireOnboarding() {
  populateOnboardingSelects();
  wireFirstRun();

  document.getElementById('ob-start')?.addEventListener('click', applyOnboardingChoices);
  document.getElementById('btn-restart-onboarding')?.addEventListener('click', () => {
    populateOnboardingSelects();
    showOnboarding();
  });

  if (window.overlay) {
    window.overlay.onGameStarted(() => {
      if (!dismissedThisSession) {
        populateOnboardingSelects();
        showOnboarding();
      }
    });
    window.overlay.onGameStopped(() => {
      dismissedThisSession = false;
    });
  }

  maybeShowFirstRun();
}
