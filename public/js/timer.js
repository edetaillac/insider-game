function formatCountdown(counter) {
    var mins = 0;
    seconds = counter;
    while(seconds >= 60) {
        seconds = seconds - 60;
        mins++
    }

    if(mins == 0 && seconds == 0) {
        soundNotify('dong');
    }

    return mins+':'+ (seconds < 10 ? "0" : "") + String(seconds)
}