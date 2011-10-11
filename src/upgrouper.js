var Upgrouper = function() {
"use strict";
// return an object so that we can restrict "use strict" to a function.
return {
    // you can set this or override getUploadUrl
    uploadUrl: '/upload',
    // a sortable container of images (as part of noun-number id="")
    groupingNoun: 'grouping',
    // one image (as part of noun-number id="")
    groupableNoun: 'groupable',
    // where the new/sortable groupings get added
    groupingsContainer: '.groupings',
    // a sortable container of images
    groupingSelector: null, // see init() below
    // one image
    groupableSelector: null, // see init() below
    // all the places where you can drop new images
    groupingDroppableSelector: '.groupingwrap,.new-grouping',
    // where you drop images to create a new grouping
    newGroupingContainer: '.new-grouping',
    // passed to jqueryui's .sortable()
    groupingSortableSettings: {
        distance: 5,
        opacity: 0.8,
        revert: 100,
        handle: '.handle',
        placeholder: 'drop',
        forcePlaceholderSize: true
    },
    // passed to jqueryui's .sortable()
    groupableSortableSettings: {
        distance: 5,
        opacity: 0.8,
        revert: 100,
        handle: 'img',
        tolerance: 'pointer',
        placeholder: 'drop',
        forcePlaceholderSize: true
    },

    nextGroupableId: 1,
    nextGroupingId: 1,
    queue: [], // {url: xxx, file: xxx, groupable: xxx}
    inProgress: 0,
    maxRequests: 6,
    previewSize: '64', // string because it is an object key, not array index
    maxImages: 1000,
    maxSize: [2*1024*1024, '2MB'],
    validExtensions: ['gif', 'png', 'jpeg', 'jpg'],

    docLeaveTimer: null,
    groupingLeaveTimers: {},

    init: function() {
        var that = this;

        if (!that.groupingSelector) {
            that.groupingSelector = '.'+that.groupingNoun;
        }
        if (!that.groupableSelector) {
            that.groupableSelector = '.'+that.groupableNoun;
        }

        // the groupings are sortable
        var settings = $.fn.extend({}, this.groupingSortableSettings, {
            update: that.groupingsSorted
        });
        $(this.groupingsContainer).sortable(settings);

        /*
        Each grouping is sortable and you can drag
        between them. We rebuild the sortables when we add a new groupable.
        */
        this.makeGroupablesSortable();

        // a method so we can call it again when we add more groupings
        this.makeGroupablesDroppable();

        function mouseEnteredWindow() {
            /*
            Remember: this function gets called more often than you might
            think. Code accordingly.
            We add a class to the body so that you can hilight the droppable
            areas when you're dragging files over the page.
            */
            $('body').addClass('dragging-files');
        }
        function mouseLeftWindow() {
            $('body').removeClass('dragging-files');
        }
        $(document)
            .bind('dragenter', function(e) {
                e.preventDefault();
                clearTimeout(that.docLeaveTimer);

                /*
                The mouse cursor entered or re-entered the window. We get lots
                of false positives because when the user temporarily moused
                over an element on the page and then off again, then this event
                will fire again. So keep that in consideration.
                */
                mouseEnteredWindow();
            })
            .bind('dragover', function(e) {
                e.preventDefault();
                clearTimeout(that.docLeaveTimer);
            })
            .bind('dragleave', function(e) {
                e.stopPropagation();

                /*
                We set a timer and if some event triggers that implies that
                we're still on the document during that time, then we clear it.
                If we reach the end of the timer, then the mouse left the
                document. This is because mousing over any element on screen
                will trigger dragleave even though you're still actually on
                the page.
                */
                that.docLeaveTimer = setTimeout(function() {
                    mouseLeftWindow();
                }, 100);
            })
            .bind("drop", function(e) {
                e.preventDefault();
                e.stopPropagation();
                // If the user dropped something somewhere on the page, then
                // dragging must have ended.
                mouseLeftWindow();
            });

        this.checkForSupport();
    },

    checkForSupport: function() {
        var xhr = new XMLHttpRequest();
        if (!xhr.upload) {
            this.notSupported();
        }
    },

    notSupported: function() {
    },

    makeGroupablesSortable: function() {
        // make the groupables that aren't sortable yet sortable.
        var that = this;
        var settings = $.fn.extend({}, this.groupableSortableSettings, {
            connectWith: this.groupingSelector,
            start: function(event, ui) {
                $(ui.item).addClass('dragging');
            },
            stop: function(event, ui) {
                $(ui.item).removeClass('dragging');
            },
            update: function(event, ui) {
                var $sortable = $(this);
                if ($sortable.find(that.groupableSelector).length == 0) {
                    // skip empty ones
                    return;
                }
                that.groupingSorted($sortable);
            }
        });
        $(this.groupingSelector).not('.ui-sortable')
            .sortable(settings)
            .each(function() {
                that.syncGroupingEnabled(this);
            });
    },

    makeGroupablesDroppable: function() {
        /*
        DroppableSelector because you're probably making a wrapper droppable
        rather than the grouping itself otherwise you could end up with an
        invisible or tiny droppable area.
        */
        var that = this;

        var newDroppables = $(this.groupingDroppableSelector)
            .not('.droppable-initialized');

        newDroppables.each(function() {
            var droppable = this;

            function mouseEnteredGrouping() {
                // Remember: this function gets called more often than you might
                // think. Code accordingly.
                $(that.groupingDroppableSelector).removeClass('droppable');
                $(droppable).addClass('droppable');
            }
            function mouseLeftGrouping() {
                $(droppable).removeClass('droppable');
            }

            $(droppable)
                .addClass('droppable-initialized')
                .bind('dragenter', function(e) {
                    e.preventDefault();
                    clearTimeout(that.docLeaveTimer);
                    clearTimeout(that.groupingLeaveTimers[$(this).attr('id')]);
                    mouseEnteredGrouping();
                })
                .bind('dragover', function(e) {
                    e.preventDefault();
                    clearTimeout(that.docLeaveTimer);
                    clearTimeout(that.groupingLeaveTimers[$(this).attr('id')]);
                })
                .bind('dragleave', function(e) {
                    e.stopPropagation();
                    clearTimeout(that.docLeaveTimer);

                    var id = $(this).attr('id');
                    that.groupingLeaveTimers[id] = setTimeout(function() {
                        mouseLeftGrouping();
                    }, 100);
                });

            droppable.addEventListener("drop", function(e) {
                e.handled = true;
                e.preventDefault();
                mouseLeftGrouping();
                that.handleDropped($(this), e.dataTransfer.files);
            }, false); // ff3.6 wants 3 params.

            $(droppable).droppable({
                accept: that.groupableSelector,
                tolerance: 'pointer',
                over: function(event, ui) {
                    if ($(this).find(that.groupableSelector).length == 0) {
                        $(this).addClass('droppable');
                    }
                },
                out: function(event, ui) {
                    $(this).removeClass('droppable');
                },
                drop: function(event, ui) {
                    $(this).removeClass('droppable');

                    /*
                    Ignore if we're dropping onto a grouping and it has
                    groupables. (Because then we would be clashing with
                    sortable()'s functionality.)
                    */
                    if ($(this).find(that.groupableSelector).length != 0) {
                        return;
                    }

                    // we're moving it elsewhere
                    var clone = ui.draggable.clone();
                    clone
                        .removeAttr('style')
                        .removeClass('dragging')
                        .removeClass('ui-sortable-helper');

                    // horrible hack to stop it from triggering a click if you
                    // dragged something that is or has a link.
                    ui.draggable.find('a').attr('href', window.location.hash);

                    ui.draggable.remove();

                    if ($(this).is(that.newGroupingContainer)) {
                        // move the draggable (the groupable item) to a new
                        // grouping
                        var filenames = [ui.draggable.find('.filename').text()]
                        // HACK: we assume the grouping is somewhere inside a
                        // wrapper...
                        var wrap = that.makeGrouping(filenames);
                        var grouping = wrap.find(that.groupingSelector)
                        grouping.append(clone);
                        $(that.groupingsContainer).append(wrap);

                        // we probably have to save this grouping
                        that.groupingCreated(grouping);

                        // there's a new grouping, so make it sortable and
                        // droppable
                        that.makeGroupablesSortable();
                        that.makeGroupablesDroppable();

                    } else {
                        // we dropped onto an empty grouping wrapper,
                        // so move the groupable there.
                        var $sortable = $(droppable)
                            .find(that.groupingSelector);
                        $sortable.append(clone);
                        that.groupingSorted($sortable);
                    }
                }
            });
        });
    },

    validateFile: function(file) {
        // return error string or false.

        // TODO: plug in filename validation

        // try and see if it is an image
        var index = file.name.lastIndexOf('.'); // yes, no match returns -1
        var extension = file.name.slice(index+1).toLowerCase();
        if (this.validExtensions.indexOf(extension) == -1) {
            return "Unknown image type.";
        }

        // check number of images
        if ($(this.groupableSelector).length > this.maxFiles) {
            return this.maxImages + " images maximum.";
        }

        // check file size
        if (file.size > this.maxSize[0]) {
            return this.maxSize[1]+' maximum';
        }

        return false;
    },

    handleDropped: function(el, files) {
        var that = this;

        var allDiv = $('<div><div>'),
            validGroupableIds = [],
            validFiles = [],
            filenames = [];
        for (var i=0; i<files.length; i++) {
            var file = files[i],
                groupable = this.makeGroupable(file)

            allDiv.append(groupable);

            var error = this.validateFile(file);
            if (error) {
                this.addGroupableError(groupable, error);
            } else {
                filenames.push(file.name);
                validFiles.push(file);
                validGroupableIds.push(this.getGroupableIdForGroupable(groupable));
            }
        }
        var allGroupables = allDiv.find(this.groupableSelector);
        allGroupables = $(allGroupables);

        if (el.is(this.newGroupingContainer)) {
            // HACK: we assume the grouping is somewhere inside a wrapper...
            var wrap = this.makeGrouping(filenames);
            var grouping = wrap.find(this.groupingSelector)
            grouping.append(allGroupables);
            $(this.groupingsContainer).append(wrap);

            // we retrieve the ones we appended again so that we have the right
            // dom reference
            var validGroupables = that.retrieveGroupablesById(validGroupableIds);

            // we should probably queue these
            this.filesDropped(grouping, validGroupables, validFiles, true);

            // there's a new grouping, so make it sortable and droppable
            this.makeGroupablesSortable();
            this.makeGroupablesDroppable();

            // we probably have to save this groupable
            this.groupingCreated(grouping, validGroupables, validFiles);

        } else {
            // HACK: we assume the grouping is somewhere inside a wrapper...
            var grouping = el.find(this.groupingSelector);
            grouping.append(allGroupables);

            // we retrieve the ones we appended again so that we have the right
            // dom reference
            var validGroupables = that.retrieveGroupablesById(validGroupableIds);

            if (validFiles.length) {
                // we're uploading, so the grouping should be disabled
                this.syncGroupingEnabled(grouping);

                // we should probably queue these
                this.filesDropped(grouping, validGroupables, validFiles, false);
            }
        }
    },

    uploadFiles: function(url, tuples) {
        // url is where to send it to,
        // tuples is an array of [file, groupable] arrays
        for (var i=0; i<tuples.length; i++) {
            this.queue.push({
                url: url,
                file: tuples[i][0],
                groupable: tuples[i][1]
            });
        }
        while (this.queue.length && this.inProgress < this.maxRequests) {
            this.uploadFile(this.queue.shift())
        }
    },

    uploadFile: function(info) {
        var that = this;
        this.inProgress += 1;

        var xhr = new XMLHttpRequest();

        var error = null;
        function done() {
            that.inProgress -= 1;
            that.fileProgress(
                info.file, info.groupable, info.file.size, info.file.size);
            var json = {};
            if (!error && xhr.status != 200) {
                error = 'Server error encountered.'
                //console.log(xhr.responseText);
            }
            if (error) {
                json.error = error;
            } else {
                if (xhr.responseText) {
                    try {
                        json = $.parseJSON(xhr.responseText);
                    } catch(e) {
                    }
                }
            }
            that.fileFinished(info.file, info.groupable, json);

            if (that.queue.length && that.inProgress < that.maxRequests) {
                that.uploadFile(that.queue.shift())
            } else {
                if (that.inProgress == 0) {
                    that.filesFinished();
                }
            }
        }

        xhr.upload['onprogress'] = function(rpe) {
            that.fileProgress(
                info.file, info.groupable, rpe.loaded, rpe.total);
        };
        xhr.onload = function(load) {
            done();
        };
        xhr.onabort = function() {
            error = "Upload aborted";
            done();
        };
        xhr.onerror = function(e) {
            error = "Server error encountered.";
            done();
        };
        var gid = this.getGroupingIdForGroupable(info.groupable);
        xhr.open("post", info.url, true);
        xhr.setRequestHeader("Cache-Control", "no-cache");
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        xhr.setRequestHeader("X-Filename", info.file.name);
        xhr.setRequestHeader("X-Groupingid", gid);
        /*
        Notice that we use send(), not sendAsBinary(). We also don't bother
        with trying to manually build up a multipart body. Eventually it might
        make more sense to use FormData so that it will be sent just like a
        'normal' POST request, but that's still a bit too bleeding edge for
        now.
        */
        xhr.send(info.file);
        this.fileStarted(info.file, info.groupable);
    },

    getGroupingIdForGroupable: function(groupable) {
        var bits = $(groupable)
            .parents(this.groupingSelector)
            .attr('id').split('-');

        if (bits.length == 2) {
            return bits[1];
        }

        return '';
    },
    makeGroupableId: function() {
        var id = this.groupableNoun+'-'+this.nextGroupableId;
        this.nextGroupableId += 1;
        return id;
    },
    makeGroupingId: function() {
        var id = this.groupingNoun+'-'+this.nextGroupingId;
        this.nextGroupingId += 1;
        return id;
    },
    getGroupableIdForGroupable: function(groupable) {
        var bits = $(groupable)
            .attr('id').split('-');

        if (bits[0] == this.groupableNoun) {
            return bits[1];
        }

        return '';

    },
    retrieveGroupablesById: function(ids) {
        var validGroupables = [];
        for (var i=0; i<ids.length; i++) {
            var id = ids[i];
            validGroupables.push($('#'+this.groupableNoun+'-'+id)[0]);
        }
        return validGroupables;
    },
    makeGroupable: function(file) {
        /*
        When we drop an actual file onto the page, this creates the new
        element. You could override this to add an <img> tag using FileReader,
        but for now it just uses no-image in the meantime. Progress, special
        classes to indicate that it is not uploaded yet, etc gets added
        elsewhere. Once the file is uploaded you can replace the image based on
        the json that got returned.
        */
        var id = this.makeGroupableId();
        var img = '<div class="no-image">&nbsp;'+
            '<div class="progress"><span class="inner">waiting</span>'+
            '</div></div>';
        var filename = file.name;
        return $('<div class="'+this.groupableNoun+' in-progress" id="'+id+'">'+img+
            '<div class="filename">'+filename+'</div>'+
            '</div>');
    },
    makeGroupingName: function(id, filenames) {
        var name = id.replace('-', ' ');
        name = name.charAt(0).toUpperCase()+name.slice(1);
        return name;
    },
    makeGrouping: function(filenames) {
        /*
        When we drag existing images or images that haven't been uploaded yet
        to the new grouping drop area, this creates the grouping element. You
        can use the filenames array to guess a name for the grouping if that
        makes sense.

        Making the grouping itself editable is your own problem ;)
        */
        var id = this.makeGroupingId();
        var name = this.makeGroupingName(id, filenames);
        return $('<div class="groupingwrap">'+
            '<span class="handle">drag</span>'+
            '<h1>'+name+'</h1>'+
            '<section>'+
            '<div class="'+this.groupingNoun+'" id="'+id+'"></div>'+
            '<div class="text">'+
            '<p>Drop images here or <span class="delete">delete</span> this '+
            'empty grouping.</p>'+
            '</div>'+
            '</section>'+
            '</div>');

    },

    fileStarted: function(file, groupable) {
        /*
        In practice it is usually better to add the initial "waiting..."
        progress indicator as soon as you create the groupable.
        */
    },
    fileProgress: function(file, groupable, loaded, size) {
        // percentage, little circle chart with canvas tag, whatever.
        var p = loaded/size*100+'';
        if (p.indexOf('.') != -1) {
            var bits = p.split('.');
            bits[1] = bits[1].slice(0, 2);
            p = bits.join('.');
        }
        p = p + '%';
        if (p == '100%') {
            // We sent the whole file, but that doesn't mean the server is
            // done processing it.
            p = 'resizing';
        }
        $(groupable).find('.progress .inner').html(p);
    },
    addGroupableError: function(groupable, error) {
        var that = this,
            $groupable = $(groupable),
            err = $('<div class="error">'+
                '<div class="text"></div>'+
                '<div class="dismiss">ok</div>'+
                '</div>');
        err.find('.text').html(error);
        /*
        err.find('.dismiss').click(function() {
            $groupable.remove();
        });
        */
        $groupable.find('.no-image,img').replaceWith(err);
    },
    getError: function(json) {
        // return a string or null
        if (json.error) {
            return json.error;
        }
        return null;
    },
    getImage: function(json) {
        /*
        This is only used by the default fileFinished()
        It should return {url, width, height, previews} at a minimum.
        */
        return json;
    },
    getPreview: function(image) {
        /*
        This is only used by the defaul fileFinished()
        It should return {url, width, height} at a minimum.
        */
        if (image.previews[this.previewSize]) {
            return image.previews[this.previewSize];
        }
        return null;
    },
    addGroupableInfo: function(file, groupable, json) {
        /*
        Use this to add some extra info like the name, links the
        different preview sizes and so on.
        Example:
        $(groupable).find('.filename').html(json.filename);
        */
    },
    fileFinished: function(file, groupable, json) {
        /*
        Remove the progress indicator,
        change the identifier to the real thing,
        replace the img tag with the real thing,
        enable the sortable if it has no in-progress images left
        etc.
        */

        var that = this,
            $groupable = $(groupable),
            error = this.getError(json);
        if (!error) {
            // replace the image with the real thing
            var image = this.getImage(json),
                preview = this.getPreview(image);
            if (preview) {
                image = preview;
            }
            var url = image.url,
                width = image.width,
                height = image.height;
            var img = $('<img src="'+url+
                            '" width="'+width+
                            '" height="'+height+'">');
            $groupable.find('.no-image,img').replaceWith(img);

            // custom stuff
            this.addGroupableInfo(file, groupable, json);

            // make it deletable
            var del = $('<div class="delete" title="Delete">Delete</div>');
            /*
            del.click(function() {
                that.confirmDeleteGroupable(groupable);
            });
            */
            $groupable.append(del);

        } else {
            this.addGroupableError(groupable, error);
        }

        $groupable.find('.progress .inner').html('done');
        $groupable.find('.progress').hide();

        $groupable.removeClass('in-progress');

        var $grouping = $groupable.parents(this.groupingSelector);
        this.syncGroupingEnabled($grouping);
    },
    filesFinished: function() {
        /*
        All done. If you disabled concurrent uploads and edits
        while uploading, this would be where to clear it.
        In practice it is typically better to just check every time
        a file finishes uploading.
        */
    },
    isGroupingEnabled: function(grouping) {
        var $grouping = $(grouping);
        // containes no groupables that are in progress...
        if ($grouping.find('.in-progress').length == 0) {
            // ...and not currently saving the order
            if (!$grouping.hasClass('saving-order')) {
                return true
            }
        }
        return false;
    },
    syncGroupingEnabled: function(grouping) {
        var enabled = this.isGroupingEnabled(grouping),
            $grouping = $(grouping);

        if (enabled) {
            $grouping.sortable('enable');
            $grouping.removeClass('sortable-disabled');
            $grouping.addClass('sortable-enabled');
        } else {
            $grouping.sortable('disable');
            $grouping.removeClass('sortable-enabled');
            $grouping.addClass('sortable-disabled');
        }
    },
    cancelDeleteGroupable: function(groupable) {
        $(groupable)
            .removeClass('groupable-confirm')
            .find('.confirmation').remove();
    },
    confirmDeleteGroupable: function(groupable) {
        if ($(groupable).hasClass('groupable-confirm')) {
            // sanity check
            return;
        }
        var confirmation = $('<div class="confirmation">'+
            '<div class="text">Are you sure?</div>'+
            '<div class="dismiss">'+
            '<span class="confirm">delete</span> / '+
            '<span class="cancel">cancel</span>'+
            '</div>'+
            '</div>');
        // actually deleting is up to you
        /*confirmation.find('.confirm').click(function() {
        });
        confirmation.find('.cancel').click(function() {
            cancelDeleteGroupable(groupable);
        });
        */
        $(groupable).addClass('groupable-confirm').append(confirmation);
    },

    getUploadUrl: function(grouping) {
        /*
        You would have to override this if the url depends on the grouping.
        For example: /api/groupings/#groupingid#/images
        Or maybe files all go to the same place and you use the groupingid
        parameter that we send along to specify where the file should go?
        */
        return this.uploadUrl;
    },

    groupingCreated: function(grouping, groupables, files) {
        /*
        Either files were dropped (groupables and files are not blank) or
        groupables were dragged from another grouping. You would probably want
        to override this so you can save the new grouping and then only
        afterwards you would start the uploads if the grouping was created by
        dropping new files.
        */
        // after saving the grouping:
        // this.upload(this.getUploadUrl(groupable),
        //      zip(files, $(grouping).find('> *')));

        /*
        If you make the grouping editable, then you should probably disable the
        grouping's form (or not create it) until the grouping has been saved.
        (as well as whenever you update the grouping)
        */

    },
    /*groupingDeleted: function(grouping) {
        //Assume that the backend clears out empty groupings automatically.
        var wrap = grouping.parents(this.groupingWrapSelector);
        wrap.remove();
    },*/
    zip: function() {
        var a = [];
        for (var i=0; i<arguments[0].length; i++) {
            var b = [];
            for (var j=0; j<arguments.length; j++) {
                b[j] = arguments[j][i];
            }
            a.push(b);
        }
        return a;
    },
    filesDropped: function(grouping, groupables, files, isNewGrouping) {
        /*
        If it is a new grouping you might want to only start the upload
        as soon as the grouping has been saved (see groupingCreated above).
        Otherwise you would probably start it immediately (the default).
        */

        if (!files.length) {
            // sanity check
            return;
        }

        var zip =  this.zip;
        this.uploadFiles(this.getUploadUrl(grouping), zip(files, groupables));
    },
    groupingSorted: function(grouping) {
        // Usually you would override this and save the order here.

        /*
        Ordinarily you would add the class 'saving-order' to the grouping
        and then sync the enabled status. Then once you're done saving,
        remove the class and sync it again.
        */
    },
    groupingsSorted: function() {
        // Usually you would override this and save the order here.
    }
};
}();
