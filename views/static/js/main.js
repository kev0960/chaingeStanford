// Register UI javascript functionality here

$("#data_txn_form").submit(function(e) {

    var url = "/new_txn"; // the script where you handle the form input.

    $.ajax({
           type: "POST",
           url: url,
           data: $("#idForm").serialize(), // serializes the form's elements.
           success: function(data)
           {
               alert(data); 
               toggle_progress('data_txn');
           }
         });

    toggle_progress('data_txn')
    e.preventDefault(); // avoid to execute the actual submit of the form.
});

const toggle_progress = function(txn_type) {
	let modal_id = '#'+txn_type;
	let progress_id = '#'+txn_type+'_progress';

	if ($(model_id).hasClass('hidden')) {
		$(model_id).removeClass('hidden');
		$(progress_id).addClass('hidden');
	} else {
		$(model_id).addClass('hidden');
		$(progress_id).removeClass('hidden');
	}
}

const show_result = function(txn_type, result) {
	let div_id = '#'+txn_type+"_result";
	$(div_id).text(result);
}