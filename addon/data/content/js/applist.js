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

    function update(data) {
        apps = data;
        appIds = Object.keys(apps).sort();
        render();
    }

    function render() {
        listEl.empty();
        if (!appIds.length) {
            listEl.append('<li><em>No Apps added yet? Add some&hellip;</em></li>');
        } else {
            for (var i=0; i<appIds.length; i++) {
                renderSingle(appIds[i]);
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
            validationResult = ''
        }
        if (app.lastUpdate) {
            app.prettyLastUpdate = timedelta(app.lastUpdate);
        }
        app.prettyType = Simulator.APP_TYPES[app.type];

        var appEl = $(appTemplate.render(app).trim());

        // FIXME: Make an actual list, add a template engine
        listEl.append(appEl);
    }

    listEl.on('click', '.action', function(e) {
        var action = $(this).data('action');
        var itemEl = $(this).parents('[data-id]');

        if (!action || !itemEl) return;

        var id = itemEl.data('id');

        e.preventDefault();

        switch (action) {
            case 'push':
                window.postMessage({ name: "pushAppToDevice", id: id }, "*");
                break;
            case 'remove':
                window.postMessage({name: "removeApp", id: id}, "*");
                break;
            case 'update':
                window.postMessage({name: "updateApp", id: id}, "*");
                break;
            case 'run':
                window.postMessage({name: "runApp", id: id}, "*");
                break;
            case 'undo':
                window.postMessage({name: "undoRemoveApp", id: id}, "*");
                break;
            case 'validation':
                itemEl.find('.app-validation-list').toggle();
                break;
        }

    });


    return {
        'update': update
    };

})();
