<?php
/*
	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
	INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
	PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
	HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
	OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
	SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

	BY CHOOSING TO USE THIS CODE IN ANY FORM, YOU AGREE TO THE TERMS THAT GOVERN
	IT'S USE.

	Licensing: Open Source - Free to use

	TCLink Process Encrypted EMV/Swipe/Keyed Transaction Example
	(expecting output from jQuery Card Parser Plugin - v.1)
	By Ash Craig - Ash Capital Ltd.

	Parameters:
		We are expecting several posted parameters for the transaction to
		process properly:

		encrpted_data - The full payload from the EMV/Swipe/Keyed device
		input_type - Not used by the script but important as you log the transaction details
		card_holder - Not used by the script but important as you log the transaction details
		amt - The amount to process

	Output:
		JSON formatted response (we include the basic response from TCLink but you
		will most likely want to include additional metrics for your environment)
*/

header('Content-type: application/json');

$encrpted_data = trim($_POST["encrpted_data"]);
$input_type = trim($_POST["input_type"]);
$card_holder = $_POST["card_holder"];
$amt = trim($_POST["amt"]);

/*
	evaluate parameters and define handling
	for omissions and non-supported input
*/

// send transaction to TCLink endpoint
$endpoint = "https://vault.trustcommerce.com/trans/";

/*
	TCLink requires the currency amount be in pennies (10.00
	becomes 1000) - you can use whatever method you want but
	here's our method:

	1. Convert the number to a 2 digit precision (in case
	the amount passed is $10 instead of $10.00)

	2. Remove the decimal from the string

	3. Remove any currency formatting (e.g. $)
*/

$amt = number_format($amt, 2, '.', '');
$amt = str_replace('.', '', $amt);
$amt = str_replace('$', '', $amt);

/*
	create an array to post
*/

$postdata = array();
$postdata["amount"] = $amt;
$postdata["action"] = "sale";
$postdata["custid"] = "your sphere custid";
$postdata["encryptedtrack"] = $encrpted_data;
$postdata["password"] = "your sphere password";

/*
	using cURL, we post the transaction
	to the endpoint
*/

$ch = curl_init();
curl_setopt($ch, CURLOPT_HEADER, 0);
curl_setopt($ch, CURLOPT_VERBOSE, 1);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 6000);
curl_setopt($ch, CURLOPT_URL, $endpoint);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 0);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $postdata);
curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/4.0 (compatible;)");

$response = curl_exec($ch);

/*
	TCLink responds with a key=value\n delineated
	result. We can build an array to make it easier
	to parse and convert to JSON output.
*/

$results = array();

//create array from results delimited by \n
$data = explode("\n", $response);

// loop the results in the data array
for ($i=0; $i < count($data)-1; $i++) {

	// the key/value pair is delimited by '='
	$line = explode("=", $data[$i]);

	//verify the temp line array has 2 items (key=value)
	if (is_array($line) && count($line) == 2) {
		$results[$line[0]] = $line[1];
	}
}

$status = strtoupper($results["status"]);

// check for error from processor
if ($status != "APPROVED" && $status != "DECLINED") {
	$response = array(
	  'status' => 'fail',
	  'msg' => $results["error"] . " " . $results["offenders"] . " " . $results["status"]
	);

	echo json_encode($response);
	die;
}

/*
	You might want to do some logging to your server
	before passing the results back to the requester
*/

/*
	output the transaction response
*/

$response = array(
	'status' => 'success',
	'results' => $results
);

echo json_encode($response);
die;

?>
