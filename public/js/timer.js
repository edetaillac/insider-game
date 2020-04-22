function countdown(minutes, noSleep) {
    var seconds = 60;
    var mins = minutes
    var timer = 0;

    function ding() {
        let audiof = new Audio('/static/sound/ding.mp3');
        audiof.play();
    }
    function dong() {
        let audiof = new Audio('/static/sound/dong.mp3');
        audiof.play();
    }

    function tick() {
        //This script expects an element with an ID = "counter". You can change that to what ever you want. 
        var counter = document.getElementById("timer");
        var current_minutes = mins-1
        seconds--;
        counter.innerHTML = current_minutes.toString() + ":" + (seconds < 10 ? "0" : "") + String(seconds);
        if( seconds > 0 ) {
            timer = setTimeout(tick, 1000);
        } else {
            if(mins > 1){
                countdown(mins-1);           
            } else {
            	dong();
                noSleep.disable();
            }
        }
    }

    function stop() {
    	if (timer) {
            clearTimeout(timer);
            var counter = document.getElementById("timer");
            counter.innerHTML = '';
            timer = 0;
        }
    }

    function pause() {
        if (timer) {
            clearTimeout(timer);
            timer = 0;
        }
    }

    window.resetTimer = stop;
    window.pauseTimer = pause;

    tick();
}