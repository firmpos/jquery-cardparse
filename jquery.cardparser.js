/*
	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
	INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
	PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
	HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
	OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
	SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

	BY CHOOSING TO USE THIS CODE IN ANY FORM, YOU AGREE TO THE TERMS THAT GOVERN
	IT'S USE.

	jQuery Card Parser Plugin - v.1
	By Ash Craig - Ash Capital Ltd.

	Licensing: Open Source - Free to use

	Dependencies:
		jQuery
		jQuery doTimeout (http://benalman.com/projects/jquery-dotimeout-plugin/)

	Parameters:
		The plugin accepts two config parameters (url & amt) you will want to
		modify it to accomodate your requirements.

		url - This is the endpoint you will submit the transaction to
		amt - This is a string value representing the currency amount to process

*/
;(function($){
	var _self = this;				//'this' reference
	var gxOPTIONS;					//options
	var gxBUFFER;					//read buffer
	var gxInputLength = 0; 			//what type: swipe/insert/dip
	var gxStatus = [
		"Error. Please try again.",
		"Please Swipe or Insert Card",
		"Reading Card Data",
		"Please Wait...",
		"Processing"
	]
	var gxStates = {
		ERROR : 0,
		READY : 1,
		READING : 2,
		PENDING : 3,
		PROCESSING : 4 }			//all possible states
	var gxState;
	var cardparser = {
		_init : function(options) {
			/*
				init the plugin and start listening
			*/

			//test for jQuery doTimeout
			if ( jQuery().doTimeout === undefined ) {
				$.error('jQuery doTimeout is required. (http://benalman.com/projects/jquery-dotimeout-plugin/)');
				return false; }

			// test for url for posting to processing server
			if ( typeof(options.url) === 'undefined' ) {
				$.error('Please provide a valid processing URL');
				return false; }

			if ( typeof(options.amt) === 'undefined' ) {
				$.error('Please provide the amount to process');
				return false; }

			//create global reference
			gxOPTIONS = options;

			// init the buffer
			gxBUFFER = '';

			//create the element
			cardparser.createElement();
		},
		ajax : function(data, url, cb){
			/*
				post to server
			*/
			$.ajax({
				type: "POST",
				url: url,
				data: data,
				dataType: "json",
				timeout: function(){
					cardparser.alert('Cannot connect to the service. Please try again.');
				},
				success: function(data){
					cb(data);
				}
			})
		},
		alert : function(msg){
			/*
				alert the user during error
			*/

			// log the error
			console.log(msg);

			// set the error state
			cardparser.changeState(gxStates.ERROR, function(){

				//set a timer to reset the state
				$.doTimeout( 'alert.stateChange', 2000, function(){
					$.doTimeout('alert.stateChange');
					//reset read state
					cardparser.changeState(gxStates.READY);
				});
			});
		},
		bind : function() {
			/*
				bind the listener to the document
			*/

			// these are keys to ignore
			var controlKeys = [
				9, 16, 17, 18, 20, 91, 93];

			//place a listener on the document to grab input from the usb device
			$(document).off("keydown.cardparser").on("keydown.cardparser", function(e){

				// does the user want to cancel?
				if (e.keyCode === 27) {

					// the user has pressed the ESC key to remove the listener
					gxState = gxStates.PENDING;

					//destroy me
					cardparser.destroy();

					return false;
				}

				/*
					read input unless the char is found in
					the controlKeys array or we are evaluating the buffer
				*/

				if (controlKeys.indexOf(e.keyCode) !== -1) {
					return false; }

				if (gxState === gxStates.PENDING || gxState === gxStates.ERROR || gxState === gxStates.PROCESSING) {
					return false; }

				// if status is ready
				if (gxState === gxStates.READY) {

					// reset input length
					gxInputLength = 0;

					//set an inital progress indication
					cardparser.progress(12);

					//change the state to READING
					cardparser.changeState(gxStates.READING, nocb); }

				// add char to the buffer
				gxBUFFER = gxBUFFER + e.key;

				//test for progress bar percentage
				if (gxInputLength === 0 && gxBUFFER.length > 60) {

					/*
					  	we have enough data to evaluate for fuzzy precision
						on our progress bar based on keyed, swipe or EMV data types
					*/

					if (/%[B\*]/.test(gxBUFFER)) {

						/*
						  	Swiped Input: IDTECH Augusta S & IDTECH SREDKey
						*/

						// fuzzy estimate: set an approximate number of chrs to receive
						gxInputLength = 430;

						// update UI message
						$('.__cpmsg_')
							.html("Reading Swipe Data")
							.show();

					} else if ( /\?\*/.test(gxBUFFER) ) {

						/*
						  	Keyed Input: IDTECH SREDKey
						*/

						// fuzzy estimate: set an approximate number of chrs to receive
						gxInputLength = 180;

						// update UI message
						$('.__cpmsg_')
							.html("Reading Keyed Data")
							.show();

					} else if ( /\<\DvcMsg/.test(gxBUFFER) ) {

						/*
						  	Swiped & Keyed Input:  IDTECH M-130
						*/

						// fuzzy estimate: set an approximate number of chrs to receive
						gxInputLength = 400;

						// update UI message
						$('.__cpmsg_')
							.html("Reading M-130 Data")
							.show();

					} else {

						/*
						  	EMV Input:  IDTECH Augusta S
						*/

						// fuzzy estimate: set an approximate number of chrs to receive
						gxInputLength = 1250;

						// update UI message
						$('.__cpmsg_')
							.html("EMV Data")
							.show();
					}
				}

				// if we have set the input type, calculate the progress
				if (gxInputLength !== 0) {

					//calculate the precentage of pregress based on the character count
					var completed = gxBUFFER.length * 100 / gxInputLength;

					// update UI progress
					cardparser.progress(completed); }

				/*
				  	To avoid waiting for termination characters and setting layered timeouts and other convoluted
					checks, we do a simple debounce using doTimeout

					This timer event will run once the stream stops.
				*/

				$.doTimeout('keydown.reading', 500, function() {

					//set the progress to 100%
					cardparser.progress(100);

					//turn off this timer
					$.doTimeout('keydown.reading');

					// change the state while eval
					cardparser.changeState(gxStates.PENDING, function(){

						//evaluate what is in the buffer
						cardparser.evalBuffer();
					});
				});
			});
		},
		changeState : function(state, cb) {
			/*
				changing the state alerts the user
				to what is going on behind the scenes
				and also helps create a smooth exit
				if the buffer is still reading
			*/

			//set the requested state
			gxState = state;

			//set the UI status
			$('.__cpmsg').text(gxStatus[gxState]);

			// set/remove class for alert state
			if (gxState === gxStates.ERROR) {

				// add the error class to the UI
				$(".__cpmsg").addClass("alert");

			} else {

				// remove the error class to the UI
				$(".__cpmsg").removeClass("alert");
			}

			//trigger the callback
			cb();
		},
		createElement : function() {
			/*
				this creates the UI and
				binds the element events
			*/

			// bind the listener
			cardparser.bind();

			// build UI overlay
			var overlay = `
				<div class="___cardparser">
					<div class="__progress">
						<div class="__progress_"></div>
					</div>
					<div class="__cpmsg"></div>
					<div class="__cpmsg_" style="display:none;">
						Please Remove Card
					</div>
					<div class="__gxbtn-container">
						<div class="__gxbtn">Cancel</div>
					</div>
				</div>
			`;

			// append to the body
			$("body").append(overlay);

			//bind the click event to cancel and stop listening
			$(".___cardparser .__gxbtn").off("click").on("click", function(){
				cardparser.destroy();
			});

			//init the state
			cardparser.changeState(gxStates.READY, nocb);
		},
		destroy : function() {
			/*
				remove the plugin and all elements
			*/

			//remove the doTimeout timer instance
			$.doTimeout('reading');

			// set state to pending to pause all input to the listener
			gxState = gxStates.PENDING

			//clear the buffer
			gxBUFFER = '';

			//remove the keyboard binding
			$(document).off("keydown.cardparser");

			//remove the click binding
			$(".__cpmsg").off("click");

			//remove the UI elements
			$(".___cardparser")
				.remove()
				.removeData();

			// remove data
			$.removeData($(this).get(0));

		},
		evalBuffer : function() {
			/*
				evaluate the contents in the buffer
			*/

			/*
				IDTECH Augusta : EMV ***************************
				test for EMV data (you may need to adjust the regex
				if the payload changes)
			*/

			// regex the contents of the buffer for pattern matching EMV
			var emv = /^[0-9A-Fa-f]+?$/.test(gxBUFFER);

			if (emv === true && gxBUFFER.length > 900) {

				//show the 'remove card' message
				$('.__cpmsg_')
					.html("PLEASE REMOVE CARD")
					.show();

				//remove card message after 5 seconds
				$.doTimeout( 'evalBuffer.cardRemove', 5000, function(){

					//remove the timer
					$.doTimeout('evalBuffer.cardRemove');

					// fade the message for graceful UI effect
					$('.__cpmsg_').fadeOut();
				});

				/*
				  	The 'process' method can accept options to assist
					in proper transaction logging on the server. EMV
					payloads do not have any plain text tags to parse
					so you will have to get the cardholder details
					after you submit to the processor.

						input_type	: string (emv)
						card_holder : an blank array
				*/

				//this is EMV, send to processing
				cardparser.process(
					{
						"input_type" : "emv",
						"card_holder" : []
					}
				);

				return false;
			}

			/*
				IDTECH Augusta/SREDKey : SWIPE *******************
				didn't get EMV data, test for swipe
				(you may need to adjust the regex
				if the payload changes)
			*/

			// regex the contents of the buffer for pattern matching swiped data
			var swipe = /%[B\*]([0-9\* ]{13,19})\^([A-Z ]+)\/([A-Z ]+).*/.test(gxBUFFER);

			//did we get swiped payload?
			if (swipe === true && gxBUFFER.length > 350) {

				//eval with regex
				var swipe = /%[B\*]([0-9\* ]{13,19})\^([A-Z ]+)\/([A-Z ]+).*/.exec(gxBUFFER);

				// do we have the data to display cardholder details to the UI?
				if (swipe[1] !== undefined && swipe[2] !== undefined && swipe[3] !== undefined) {

					// build the cardholder message to display
					var str = `${swipe[3]}&nbsp;${swipe[2]}&nbsp;(${swipe[1]})`;

					//display the cardholder string
					$('.__cpmsg_')
						.html(str)
						.show();
				}

				/*
				  	The 'process' method accepts these options to assist
					in proper transaction logging on the server:
						input_type	: string (swipe)
						card_holder : an array with the following keys:
							(0) - full string match
							(1) - Masked Pan (4124********9990)
							(2) - Cardholder last name
							(3) - Cardholder first name
				*/

				//send to processing
				cardparser.process(
					{
						"input_type" : "swipe",
						"card_holder" : swipe
					}
				);
				return false;
			}
			/*
				IDTECH SREDKey KEYED ******************************
				didn't get swipe data, test for keyed
				(you may need to adjust the regex
				if the payload changes)
			*/

			// regex the contents of the buffer for pattern matching keyed data
			var keyed = /;([0-9\* ]{13,19})\=([0-9]{2})([0-9]{2})/.test(gxBUFFER);

			//did we get keyed payload?
			if (keyed === true && gxBUFFER.length > 100) {

				//eval with regex
				var keyed = /;([0-9\* ]{13,19})\=([0-9]{2})([0-9]{2})/.exec(gxBUFFER);

				// do we have the data to display cardholder details to the UI?
				if (keyed[1] !== undefined && keyed[2] !== undefined && keyed[3] !== undefined) {

					// build the cardholder message to display
					var str = `${keyed[1]}&nbsp;${keyed[3]}/${keyed[2]}`;

					//display the cardholder string
					$('.__cpmsg_')
						.html(str)
						.show();
				}

				/*
				  	The 'process' method accepts these options to assist
					in proper transaction logging on the server:
						input_type	: string (keyed)
						card_holder : an array with the following keys:
							(0) - full string match(4111********1111=2302)
							(1) - Masked Pan (4111********1111)
							(2) - Two digit year (23)
							(3) - Two digit month (02)
				*/

				//send to processing
				cardparser.process(
					{
						"input_type" : "keyed",
						"card_holder" : keyed
					}
				);
				return false;
			}
			/*
				IDTECH M-130 SWIPED/KEYED ******************************
				test for legacy M130 by finding the terminating tag </DvcMsg>
			*/

			// regex the contents of the buffer for pattern matching M-130 data
			var legacy = /\<\/DvcMsg\>/.test(gxBUFFER);

			//did we get legacy payload?
			if (legacy === true) {

				// use jQuery to find the Entry attribute on the Dvc tag
				var entrytype = $(gxBUFFER).find('Dvc').attr('Entry');

				// define the input type
				if (entrytype === "SWIPE") {

					// this is a swiped entry, get the cardholder and masked pan from tags

					// use jQuery to find the CHolder attribute on the Card tag
					var cardholder = $(gxBUFFER).find('Card').attr('CHolder');

					// use jQuery to find the MskPAN attribute on the Card tag
					var maskpan = $(gxBUFFER).find('Card').attr('MskPAN');

					// display the cardholder string
					$('.__cpmsg_')
						.html(`${maskpan}&nbsp;${cardholder}`)
						.show();
				}

				if (entrytype === "MANUAL") {

					// this is a keyed entry, get the cardholder and masked pan from tags

					// use jQuery to find the CHolder attribute on the Card tag
					var cardholder = $(gxBUFFER).find('Card').attr('CHolder');

					// use jQuery to find the MskPAN attribute on the Card tag
					var maskpan = $(gxBUFFER).find('Card').attr('MskPAN');

					// display the cardholder string
					$('.__cpmsg_')
						.html(`Keyed: ${maskpan}`)
						.show();
				}

				/*
				  	The 'process' method accepts these options to assist
					in proper transaction logging on the server:
						input_type	: string (keyed)
						card_holder : an array with the following keys:
							(0) - Masked Pan (4111********1111)
							(1) - Cardholder last/first name
				*/

				var card_holder = [ maskpan, cardholder];

				// send to processing
				cardparser.process(
					{
						"input_type" : entrytype,
						"card_holder" : card_holder
					}
				);
				return false;
			}
			/*
				we didn't get any usable data, reset
			*/

			//clear buffer
			gxBUFFER = '';

			//reset the progress
			cardparser.progress(0);

			// reset the message
			$('.__cpmsg_')
				.html('')
				.hide();

			//display error to UI
			cardparser.changeState(gxStates.ERROR, function(){

				//reset the UI in 2 seconds
				$.doTimeout( 'evalBuffer.stateChange', 2000, function(){

					// clear timer
					$.doTimeout('evalBuffer.stateChange');

					//reset read state
					cardparser.changeState(gxStates.READY, nocb);
				});
			});
		},
		postProcessing : function(response){
			/*
				create the UI to display the transaction results
			*/
			var processor_msg;
			var processing_status;
			var result_class = "approved";

			//eval the response
			if (response.status === "approved") {

				// build the UI strings
				processing_status = "Approved";
				processor_msg = `Auth: ${response.authcode}`;

			} else {

				// build the UI strings
				processing_status = "Declined";
				processor_msg = `MSG: ${response._response}`;

				// set the UI class to declined
				result_class = "declined";
			}

			// build UI overlay
			var msg = `
				<div class="__processing_msg ${result_class}">${processing_status}</div>
				<div class="___processing_msg">${processor_msg}</div>
				<div class="___gxbtn-container">
					<div class="__gxbtn">Close Window</div>
				</div>
			`;

			//update the UI with processing message
			$(".___cardparser").html(msg);

			//bind the click event to close and stop listening
			$(".___cardparser .__gxbtn").off("click").on("click", function(){
				cardparser.destroy();
			});

		},
		process : function(opt) {
			/*
			  	this is where we pass the payload to the
				server to post to tclink
			*/

			//this is what we have in the buffer
			console.log(`Processing: ${gxBUFFER}`);

			// change the state to stop any more input flow to the buffer
			cardparser.changeState(gxStates.PROCESSING, nocb);

			/*
			  	build parameters to pass to the server (you
				may want to validate the parameters before
				submission)
			*/
			var parm = {
				"card_holder" : opt.card_holder,
				"input_type" : opt.input_type,
				"encrpted_data" : gxBUFFER,
				"amt" : gxOPTIONS.amt
			}

			// post to the endpoint and process the transaction
			cardparser.ajax(parm, gxOPTIONS.url, function(data){

				// the transaction completed, evaluate the status
				if (data.status == "success") {

					/*
					  	do clean up once the request completes
					*/

					//clear buffer
					gxBUFFER = '';

					//create the response view
					cardparser.postProcessing(data.results);

				} else {

					//there has been an error. try to get the details
					cardparser.changeState(gxStates.ERROR, nocb);

					$('.__cpmsg_')
						.html(data.msg)
						.show();
				}
			});
		},
		progress : function(pct){
			/*
				set the percentage of UI progress bar
			*/
			$('.__progress_').css({"width" : `${pct}%`});
		},
	};
	function destroy(){
		cardparser.destroy();
	}
	function nocb(){}
	$.fn.cardparser = function(methodOrOptions) {
		if ( cardparser[methodOrOptions] ) {
			return cardparser[ methodOrOptions ].apply( this, Array.prototype.slice.call( arguments, 1 ));
		} else if ( typeof methodOrOptions === 'object' || ! methodOrOptions ) {
			return cardparser._init.apply( this, arguments );
		} else {
			$.error( 'Method ' +  methodOrOptions + ' does not exist on jQuery.cardparser' );
		}
	};
})( jQuery );
