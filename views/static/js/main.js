// Register UI javascript functionality here

console.log("including main.js");

let txn_types = ['data_txn', 'req_txn', 'ans_txn'];
let modal_ids= ['#addModal', '#verifyModal', '#answerModal', 'txnsModal', '#linkGenerator'];

/* Register Ajax calls per txn creation form ... */
for (let i = 0; i <  txn_types.length; i++) {
	let txn_type = txn_types[i];
	let form_id = '#'+txn_type+"_form";

	$(form_id).submit(function(e) {
		e.preventDefault(); // avoid to execute the actual submit of the form.

	    var url = "/new_txn";

	    $.ajax({
	           type: "POST",
	           url: url,
	           data: $(form_id).serialize(), // serializes the form's elements.
	           success: function(data)
	           {
	           	    if (data != undefined && data['success'] == true) {
	           	    	alert("Nice! We saved your data successfully. Please checkout your dashboard.");
	           	    } else {
	           	    	if ('message' in data) {
	           	    		alert(data['message']);
	           	    	} else {
	           	    		alert("Error while saving your data. Please try again.");
	           	    	}
	           	    }
	               toggle_progress(txn_type);
	           }
	    });

	    toggle_progress(txn_type)
	});
}

let form_id = '#link_generator_form';
$(form_id).submit(function(e) {
    e.preventDefault(); // avoid to execute the actual submit of the form.

    var url = "/new_txn";

    $.ajax({
        type: "POST",
        url: url,
        data: $(form_id).serialize(), // serializes the form's elements.
        success: function(data)
        {
            if (data != undefined && data['success'] == true) {
                alert("Nice! We saved your data successfully. Please checkout your dashboard.");
            } else {
                alert("Error while saving your data. Please try again.");
            }
            toggle_progress(txn_type);
        }
    });

    toggle_progress(txn_type)
});

/* Register modal related callbacks */
for (let i = 0; i < modal_ids.length; i++) {
	let modal_id = modal_ids[i];

	$(modal_id).on('hidden.bs.modal', function () {
    	location.reload();
	})
}

/* For coloring data txns in dashboard */
var sig_texts = $('.sig');
for (let i = 0; i < sig_texts.length; i++) {
	let sig = sig_texts[i].value;
	let block_num = $('#block_for_'+sig)[0].value;
	let panel = $('#panel_heading_'+sig);

	if (block_num == 'Pending') {
		panel.addClass('pending');
	} 
}


/* Register stuff to do when the dom is ready */
$( document ).ready(function() {
	reload_pending_txns('#pending_txns');
});

/* For refreshing the pending (the ones that I'm being requested for) txns list */
const reload_pending_txns = function(ul_id) {

	// talk to the server to retrieve all pending txns

	let url = "/pending_txns";

	$.ajax({
		type: "GET",
	    url: url,
	    success: function(txn_list) {

	    	let li_start = "<li>";
	    	let li_end = "</li>";
	    	let ul = $(ul_id);

	    	if (txn_list == undefined || txn_list == null || txn_list.length == 0) {
	    		let li_elem = li_start + "No pending requests"+li_end;
	    		ul.append(li_elem);
	    	} else {
	    		for (let i = 0; i < txn_list.length; i++) {
	    			let req = txn_list[i];
	    			let ok_button = "<a href='#' onclick='accept_request()'>OK</a>";
	    			let li_elem = li_start + req.email + " requests: "+ req.key + ok_button+li_end;
	    			ul.append(li_elem);
	    		}
	    	}
	    }
	});
};


const toggle_progress = function(txn_type) {
	let modal_id = '#'+txn_type;
	let progress_id = '#'+txn_type+'_progress';

	if ($(modal_id).hasClass('hidden')) {
		$(modal_id).removeClass('hidden');
		$(progress_id).addClass('hidden');
	} else {
		$(modal_id).addClass('hidden');
		$(progress_id).removeClass('hidden');
	}
};

const show_result = function(txn_type, result) {
	let div_id = '#'+txn_type+"_result";
	$(div_id).text(result);
};

// TODO : dynamically pull app_storage addressese from a repo online
let app_addrs = {'Link Generator': 'http://localhost:4000/create_link_js'};

// once API.js is loaded, start pulling 3rd party frontend modules.
for (let key in app_addrs) {
    let addr = app_addrs[key];
    $.getScript(addr, function(data, textStatus, jqxhr) {
    	if (jqxhr.status == 200){
            console.log('Successfullly read in script from ' + key);
		}
        // If jqxhr.status == 200, the code is executed right away.
    });
}