// A.5.f — styling for the re-mounted RAC onboarding canvas (RACChatbotPanel).
// The Astro `/start` surface carried its own CSS; when RAC moved in-app the
// panel had only semantic classes. This is the in-app stylesheet, injected by
// AppTheme. Brand purple is the unified #6600FF (Contract §41 / PreviewStyle).

export const ONBOARDING_STYLES = `
.rac-onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  width: min(640px, 92vw);
  max-height: 86vh;
  margin: auto;
  background: #14141c;
  color: #f5f5fa;
  border: 1px solid #2a2a36;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55), 0 0 0 100vmax rgba(8, 8, 14, 0.6);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}
.rac-onboarding-overlay .rac-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #2a2a36;
  background: linear-gradient(180deg, rgba(102, 0, 255, 0.14), transparent);
}
.rac-onboarding-overlay .rac-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.rac-onboarding-overlay .rac-phase-chip {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: rgba(102, 0, 255, 0.18);
  color: #b794ff;
  border: 1px solid rgba(102, 0, 255, 0.4);
}
.rac-onboarding-overlay .rac-transcript {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.rac-onboarding-overlay .rac-turn {
  max-width: 85%;
  padding: 0.6rem 0.85rem;
  border-radius: 12px;
  line-height: 1.45;
  font-size: 0.95rem;
}
.rac-onboarding-overlay .rac-turn--assistant {
  align-self: flex-start;
  background: #1c1c28;
  border: 1px solid #2a2a36;
}
.rac-onboarding-overlay .rac-turn--user {
  align-self: flex-end;
  background: #6600ff;
  color: #fff;
}
.rac-onboarding-overlay .rac-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0 1.25rem 0.5rem;
}
.rac-onboarding-overlay .rac-suggestion {
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  background: #1c1c28;
  border: 1px solid #3a2a5a;
  color: #d8c8ff;
  font-size: 0.85rem;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-suggestion:hover {
  border-color: #6600ff;
  color: #fff;
}
.rac-onboarding-overlay .rac-summary {
  padding: 0 1.25rem;
  font-size: 0.85rem;
  color: #a8a8b5;
}
.rac-onboarding-overlay .rac-error {
  margin: 0 1.25rem 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  background: rgba(255, 80, 80, 0.12);
  border: 1px solid rgba(255, 80, 80, 0.4);
  color: #ff9a9a;
  font-size: 0.85rem;
}
.rac-onboarding-overlay .rac-input-row {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid #2a2a36;
  background: #101019;
}
.rac-onboarding-overlay .rac-input {
  flex: 1 1 auto;
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  border: 1px solid #2a2a36;
  background: #1c1c28;
  color: #f5f5fa;
  font-size: 0.95rem;
}
.rac-onboarding-overlay .rac-input:focus-visible {
  outline: none;
  border-color: #6600ff;
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.3);
}
.rac-onboarding-overlay .rac-send {
  padding: 0.65rem 1.1rem;
  border-radius: 10px;
  border: none;
  background: #6600ff;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-send:hover { background: #5500dd; }
`;
