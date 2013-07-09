function timedelta(d1) {
    d1 = new Date(d1);
    var d = ~~((Date.now() - d1.getTime()) / 1000);
    if (d < 60) return 'just now';
    if (d < 120) return 'a minute ago';
    if (d < 3600) return ~~(d/60) + ' minutes ago';
    d = ~~(d/3600);
    if (d < 2) return 'an hour ago';
    if (d < 24) return d + ' hours ago';
    d = ~~(d/24);
    if (d < 2) return 'a day ago';
    if (d < 30) return d + ' days ago';
    if (d < 60) return 'a month ago';
    if (d < 360) return ~~(d/30) + ' months ago';
    if (d < 365*2) return 'a year ago';
    return ~~(d / 365) + ' years ago';
}

var AppList = (function() {

    window.appTemplate = new nunjucks.Template($('#app-template').html());

    var listEl = $('#apps-list');

    var apps = {};
    var appIds = [];

    function updateAll(data) {
        console.log('updating all apps');
        if (!data) {
            return;
        }
        apps = data;
        appIds = Object.keys(apps).sort();
        render();
    }

    function update(id, data) {
        console.log('updating', id);
        var app = apps[id];
        if (!app) {
            return;
        }
        if ('key' in app) {
            // if data is a whole app, replace the record.
            apps[id] = app;
        } else {
            // otherwise, extend the app object.
            for (key in data) {
                app[key] = data[key];
            }
        }
        render(id);
    }

    function render(id) {
        if (id) {
            // re-render a single app in place.
            var row = $('[data-id="'+id+'"]');
            if (row.length) {
                row.replaceWith(renderSingle(id));
            }
        } else {
            // re-render all apps.
            console.log('re-rendering all apps');
            listEl.empty();
            if (appIds.length) {
                for (var i = 0, len = appIds.length; i < len; ++i) {
                    listEl.append(renderSingle(appIds[i]));
                }
            } else {
                listEl.append('<li class="notice">No Apps Installed</li>');
            }
        }
    }

    function renderSingle(id) {
        console.log('rendering', id);
        // FIXME: forEach workaround as for-in resulted in broken index
        var app = apps[id];

        app.id = id;
        var validationResult = 'OK';
        if (app.validation.errors.length > 0) {
            validationResult = '';
        }
        if (app.lastUpdate) {
            app.prettyLastUpdate = timedelta(app.lastUpdate);
        }
        app.prettyType = Simulator.APP_TYPES[app.type];

        // use a default icon
        var iconPath = "default.png";

        if (app.icon) {
            if (app.icon.indexOf("data:image/") === 0) {
                // set the src to the data uri
                iconPath = app.icon;
            } else if (app.type === "hosted") {
                // hosted app icon is relative to the app origin
                iconPath = app.origin + app.icon;
            } else if (app.type === "local") {
                // use the file protocol for local apps
                // We need to support unix and win path separators
                var lastPathSep = app.id.lastIndexOf("/");
                if (lastPathSep == -1) {
                    lastPathSep = app.id.lastIndexOf("\\");
                }
                iconPath = "file://" + app.id.substring(0, lastPathSep) + app.icon;
            }
        }

        app.iconPath = iconPath;
        app.receiptTypes = [
            {id: 'none', pretty: 'None'},
            {id: 'ok', pretty: 'Valid'},
            {id: 'invalid', pretty: 'Invalid'},
            {id: 'refunded', pretty: 'Refunded'}
        ];

        var appEl = $(appTemplate.render(app).trim());

        // FIXME: Make an actual list, add a template engine
        return appEl;
    }

    listEl.on('change', '.receipt-type', function(e) {
        var itemEl = $(this).parents('[data-id]');

        if (!itemEl) return;

        var id = itemEl.data('id');

        window.postMessage({name: "updateReceiptType", id: id, receiptType: this.value}, "*");
    });

    listEl.on('click', '.action', function(e) {
        var action = $(this).data('action');
        var itemEl = $(this).parents('[data-id]');

        if (!action || !itemEl) return;

        var id = itemEl.data('id');

        e.preventDefault();

        switch (action) {
            case 'reveal':
                window.postMessage({ name: "revealApp", id: id }, "*");
                break;
            case 'push':
                window.postMessage({ name: "pushAppToDevice", id: id }, "*");
                break;
            case 'remove':
                window.postMessage({name: "removeApp", id: id}, "*");
                break;
            case 'update':
                window.postMessage({name: "updateApp", id: id}, "*");
                break;
            case 'undo':
                window.postMessage({name: "undoRemoveApp", id: id}, "*");
                break;
            case 'validation':
                itemEl.find('.app-validation-list').toggle();
                break;
            case 'connect':
                window.postMessage({name: "connectToApp", id: id}, "*");
                break;
        }

    });


    return {
        'updateAll': updateAll,
        'update': update,
        'apps': apps
    };

})();
