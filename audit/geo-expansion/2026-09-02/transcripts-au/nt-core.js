var __version = '2.6.8.7.20231206';
var __serverUrl = 'server/request/execute.do;jsessionid=node01ml799e6vrodz1isj88640a7h63265.node0';
var __loginUrl = 'login.do;jsessionid=node01ml799e6vrodz1isj88640a7h63265.node0';
var __logoutUrl = 'logout.do;jsessionid=node01ml799e6vrodz1isj88640a7h63265.node0';
var __alias = 'nrmaps';
var __path = '';

var __WEAVE_INCLUDE = {
	script: function(libraryName) {
		document.write('<script type="text/javascript" src="'+libraryName+'"></script>');
	},

	scriptLoading: function(msg){
		if(document.getElementById("loading-msg")){
			document.write('<script type="text/javascript">document.getElementById("loading-msg").innerHTML = "' + msg + '";</script>');
		}
	},

	load: function() {
		this.scriptLoading('Loading Core APIs');
		this.script('static/static-3c1e7dd7.js');
		this.scriptLoading('Loading UI Components');
		this.script('dynamic/dynamic-ea271632.js;jsessionid=node01ml799e6vrodz1isj88640a7h63265.node0');
		this.scriptLoading('Loading Application');
		this.script('app/nrmaps/app-7d1c55e2.js;jsessionid=node01ml799e6vrodz1isj88640a7h63265.node0');
		this.scriptLoading('Starting Application...');
	}
}

__WEAVE_INCLUDE.load();
