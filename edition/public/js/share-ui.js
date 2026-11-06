// The public edition doesn't send prayer requests to a parish's prayer list.
import { h } from './ui.js';

export const canShare = () => false;
export const shareFields = () => ({ el: h('div', { hidden: true }), on: false, onToggle: null, answers: () => null, remember() {} });
export const queueShares = () => [];
export const cancelShares = () => {};
export const sharingNote = () => '';
export const sharedNote = () => null;
export const shareButton = () => null;
export function sendSharesSoon() {}
export function openShareSheet() { return null; }
export function startSharing() {}
export const shareCard = () => null;
