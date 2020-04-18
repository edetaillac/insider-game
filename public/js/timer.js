function countdown(minutes) {
    var seconds = 60;
    var mins = minutes
    var timer = 0;

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
            	//ding dong
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

    window.resetTimer = stop;

    tick();
}