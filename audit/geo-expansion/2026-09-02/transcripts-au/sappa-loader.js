if (!window.console) {
    var console = {
        log: function () {
        },
        warn: function () {
        },
        error: function () {
        },
        info: function () {
        }
    }
}

var dojoConfig = {
    parseOnLoad: true,
    async: true
};

$(document).ready(function () {
    $(function () {
        var url = '';

        var getScripts = function (url, type) {
            return $.ajax({
                url: url,
                success: null,
                dataType: type,
                error: function (xhr, textStatus, errorStatus) {
                    console.log("script failed to load - URL " + url + " , error" + xhr + " : " + textStatus + " | " + errorStatus);
                    console.log(xhr);
                }
            });
        };

        $.ajax({
            cache: false,
            url: "dist/css/rev-manifest.json",
            dataType: "json",
            success: function (manifest) {
                var cssUrl = 'dist/css/' + manifest['all.min.css'];
                console.log("css manifest url " + cssUrl);
                // $("#cssContainer").load('dist/css/' + cssUrl);
                $('<link>').appendTo('head').attr({type: 'text/css', rel: 'stylesheet'}).attr('href', cssUrl);
            }
        });

        $.ajax({
            cache: false,
            url: "dist/html/rev-manifest.json",
            dataType: "json",
            success: function (manifest) {
                var htmlUrl = 'dist/html/' + manifest['widgets.html'];

                console.log("html manifest url " + htmlUrl);
                (function ($) {
                    $.htmlManifest = function () {
                        return htmlUrl;
                    };
                })(jQuery);
            }
        });

        $.ajax({
            cache: false,
            url: "dist/js/rev-manifest.json",
            dataType: "json",
            success: function (manifest) {
                url += manifest['all.min.js'];
                console.log("js manifest url " + url);
                //$.when(getScripts('dist/js/source.js')
                    $.when(getScripts('dist/js/' + url)
                ).done(function () {
                        console.log("loaded main scripts");
                        scriptLoadPromise.promise();
                        scriptLoadPromise.resolve();
                        Main.init();
                    }
                );
            }
        });

    });

});
