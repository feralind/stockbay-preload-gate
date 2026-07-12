// @ts-check

let selectedSym = 'AAPL';

export function getSelectedSym() {
  return selectedSym;
}

export function setSelectedSym(sym) {
  selectedSym = String(sym || 'AAPL').toUpperCase();
  return selectedSym;
}
