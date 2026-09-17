/* global soundNotify */
function formatCountdown(counter) {
    const mins = Math.floor(counter / 60);
    const seconds = counter % 60;

    if (mins === 0 && seconds === 0) {
        soundNotify('dong');
    }

    return mins + ':' + (seconds < 10 ? '0' : '') + String(seconds);
}
