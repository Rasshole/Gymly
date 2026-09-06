
var $j = jQuery.noConflict();

$j(document).ready(function() {
	"use strict";

	$j('#billing_first_name_field input').attr('placeholder', 'Όνομα');
$j('#billing_last_name_field input').attr('placeholder', 'Επίθετο');
$j('#billing_address_1_field input').attr('placeholder', 'Διεύθυνση');
$j('#billing_city_field input').attr('placeholder', 'Κωμόπολη / Πόλη');
$j('#billing_postcode_field input').attr('placeholder', 'Ταχυδρομικός κωδικός');
$j('#billing_phone_field input').attr('placeholder', 'Τηλέφωνο');
$j('#billing_company_field input').attr('placeholder', 'Επωνυμία Εταιρείας');

$j("#order_c_company_field").hide();
$j("#order_c_occupation_field").hide();
$j("#order_c_vatnumber_field").hide();
$j("#order_c_foy_field").hide();

$j("#order_invoice").click(function() {
    if($j(this).is(":checked")) {
        $j("#order_c_company_field").show();
$j("#order_c_occupation_field"). show();
$j("#order_c_vatnumber_field"). show();
$j("#order_c_foy_field"). show();
    } else {
        $j("#order_c_company_field").hide();
$j("#order_c_occupation_field").hide();
$j("#order_c_vatnumber_field").hide();
$j("#order_c_foy_field").hide();
    }
});});
