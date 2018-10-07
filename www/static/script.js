document.addEventListener( "DOMContentLoaded", function() {
    var globals = {
        "currentCat": "",
        "currentView": function () {},
        "currentPage": "",
        "iterator": "",
        "pendingEdits": 0,
        "numSessionEdits": 0
    };

    // Event listeners
    // (categories dropdown handler is defined below VIEWS)

    document.getElementById( "options-collapse" ).addEventListener( "click", function ( event ) {
        var optionsDiv = document.getElementById( "options" );
        optionsDiv.style.display = ( optionsDiv.style.display === "none" ) ? "block" : "none";
        event.target.textContent = ( event.target.textContent === "show options" )
            ? "hide options" : "show options";
    } );

    document.getElementById( "skip-page-dropdown-toggle" ).addEventListener( "click", function () {
        document.getElementById( "skip-page-dropdown-container" ).classList.toggle( "show" );
    } );

    document.getElementById( "save-indicator" ).addEventListener( "click", function () {
        var saveResults = document.getElementById( "save-results" );
        saveResults.style.display = ( saveResults.style.display === "none" ) ? "block" : "none";
    } );

    document.getElementById( "skip-page" ).addEventListener( "click", function () {
        this.disabled = true;
        updateCategorySize();
        nextPage();
        document.getElementById( "skip-page-dropdown-container" ).classList.remove( "show" );
    } );

    document.getElementById( "skip-page-random" ).addEventListener( "click", function () {
        this.disabled = false;
        updateCategorySize();
        nextPage( /* random */ true );
        document.getElementById( "skip-page-dropdown-container" ).classList.remove( "show" );
    } );

    function nextPage(random) {
        function handleNextPage( nextPage ) {
            globals.currentPage = nextPage;
            var pageNameElement = document.getElementById( "current-page-name" );

            // Clear "Current page" stuff
            while( pageNameElement.firstChild ) {
                pageNameElement.removeChild( pageNameElement.firstChild );
            }

            pageNameElement.appendChild( makeWikilink( globals.currentPage ) );

            // Add a link to the current page's history
            pageNameElement.innerHTML += " (<a href='https://en.wikipedia.or" +
                "g/w/index.php?title=" +
                encodeURIComponent( globals.currentPage ).replace( "'", "%27" ) +
                "&action=history'>hist</a>)";

            apiFunctions.getPageText( globals.currentPage ).then( function ( pageText ) {
                var loadStatus = globals.currentView( pageText );
                if( !loadStatus && document.getElementById( "skip-unfixable" ).checked ) {

                    // If the load failed and the options say to skip unfixable
                    // (aka unloadable) pages, recurse on the next page we get
                    // from the iterator
                    globals.iterator.next( false ).then( handleNextPage );
                } else {
                    document.getElementById( "skip-page" ).disabled = false;
                }
            } );
        }

        globals.iterator.next( random ).then( handleNextPage );
    }

    function updateCategorySize() {
        apiFunctions.getCategorySize( globals.currentCat ).then( function ( count ) {
            var backlogSize = document.getElementById( "backlog-size" );
            backlogSize.innerHTML = "(Size: ";
            backlogSize.appendChild( makeWikilink( globals.currentCat, count.toLocaleString() + " pages" ) );
            backlogSize.innerHTML += ")";
        } );
    }

    /*
     * A dictionary mapping category names to the functions that display the
     * user interface for pages in the named categories.
     *
     * Each of these functions will return true on success and false on failure.
     * If the return value is false, nextPage will skip to the next page (if the
     * appropriate option is enabled).
     */
    var VIEWS = {
        "Category:Pages with duplicate reference names": function ( pageText ) {
            var refElementRe = /<ref[\s\S]*?(?:<\/ref>|\/>)/g;
            var refMatch;
            var OPEN_TAG = new RegExp( "^<ref\\s+name\\s*=\\s*(?:\"|\')?([^>\\/\\\\\"\']+)(?:\"|\')?\\s*(\\/?)>" );
            var CONTEXT_LENGTH = 100;
            var refs = [];
            var exitOnSelfClosing = document.getElementById( "skip-selfclosing" ).checked;
            while( refMatch = refElementRe.exec( pageText ), refMatch ) {
                var refMatchText = refMatch[0];
                var refMatchStart = refMatch.index;
                var refMatchEnd = refMatch.index + refMatchText.length;
                var match = OPEN_TAG.exec( refMatchText );
                if( match && match[1] && match[1].trim().length ) {
                    if( exitOnSelfClosing && !!match[2] ) {
                        return false;
                    }
                    refs.push( {
                        "ref": refMatchText,
                        "name": match[1].trim(),
                        "selfclosing": !!match[2],
                        "context": [
                            pageText.substring( Math.max( 0, refMatchStart - CONTEXT_LENGTH ), refMatchStart ),
                            pageText.substring( refMatchEnd, Math.min( refMatchEnd + CONTEXT_LENGTH, pageText.length - 1 ) )
                        ]
                    } );
                }
            }

            var refNameTallies = {};
            refs.forEach( function ( refObject ) {
                if( refObject.name && !refObject.selfclosing ) {
                    refNameTallies[ refObject.name ] = ( refNameTallies[ refObject.name ] || 0 ) + 1;
                }
            } );
            var dupeRefs = {};
            refs.forEach( function ( refObject ) {
                if( refNameTallies[refObject.name] > 1 ) {
                    dupeRefs[ refObject.name ] = ( dupeRefs[ refObject.name ] || [] ).concat( refObject );
                }
            } );

            if( Object.keys( dupeRefs ).length === 0 ) {
                document.getElementById( "edit-panel" ).innerHTML = "<div class='error'>The duplicate reference problem on this page isn't fixable! Possible causes: <ul><li>The parser couldn't find the duplicate references</li><li>One of the duplicate references is inside a template, so we can't modify it</li></ul></div>";
                return false;
            }

            // Flag references with duplicated texts, not just names
            var matchTexts = [];
            var hasDuplicateMatchText = matchTexts.indexOf( refMatchText ) !== -1;
            if( !hasDuplicateMatchText ) {
                matchTexts.push( refMatchText );
            }

            document.getElementById( "edit-panel" ).innerHTML = "";
            var listElement = document.createElement( "ul" );

            /**
             * A warning with this function: it starts a span element but doesn't
             * close it, since we still might put extra stuff in afterwards, such
             * as the self-close button or duplicate warnings. Why can't we just
             * close it and use appendChild? Because we're working with HTML
             * strings, not actual DOM objects (like DocumentFragment).
             */
            function makeRefListItemHtml ( refname, refnum, firstTextarea ) {
                return "<span class='vertical-align'><textarea class='mw-ui-input" +
                    ( firstTextarea ? "" : " has-button" ) + "' data-refname='" +
                    refname + "' data-refnum='" + refnum + "'>" +
                    escapeHtml( dupeRefs[refname][refnum].ref ) + "</textarea>";
            }
            Object.keys( dupeRefs ).forEach( function ( dupeRefName ) {
                var newInnerElement = document.createElement( "li" );
                var newInnerElementHtml = "";
                newInnerElementHtml += "<span class='ref-name'>" + dupeRefName +
                    "</span> <span class='ref-count'>(" + dupeRefs[dupeRefName].length +
                    " total references)</span><ul>";
                var ourDupeRefs = dupeRefs[dupeRefName];
                var firstTextarea = true;

                // We do duplicate checks at this point because pruning is done by now

                // Holds full texts for duplicate checking on those
                var allMatchTexts = [];

                // Holds URLs only for duplicate checking
                var urls = [];

                // Extracts the URL from a ref
                var urlRe = /\|\s*url\s*=\s*(.+?)\s*(?:\}\}|\|)/;
                function urlFromRef( ref ) {
                    var match = urlRe.exec( ref );
                    if( match ) {
                        var url = match[1].trim();
                        return url;
                    } else {
                        return null;
                    }
                }

                for( var i = 0; i < ourDupeRefs.length; i++ ) {
                    if( ourDupeRefs[i].selfclosing ) {

                        // Count the # of selfclosing refs after this
                        for( var j = i; j < ourDupeRefs.length; j++ ) {
                            if( !ourDupeRefs[j].selfclosing ) break;
                        }

                        newInnerElementHtml += "<li>(" + ( j - i ) +
                            " self-closing reference" + ( ( j - i === 1 ) ? "" : "s" ) +
                            " - <a class='display-self-closing' href='#'>show</a>)</li>";
                        i = j - 1;
                    } else {
                        var ourRef = ourDupeRefs[i].ref;
                        var url = urlFromRef( ourRef );

                        newInnerElementHtml += "<li>";
                        newInnerElementHtml += makeRefListItemHtml( dupeRefName, i, firstTextarea );

                        if( firstTextarea ) {
                            firstTextarea = false;

                            // We always need to check subsequent full texts against the first one
                            allMatchTexts.push( ourRef );

                            // Also push the URL (if it exists)
                            if( url ) urls.push( url );
                        } else {
                            newInnerElementHtml += "<div class='self-closing-container'>";
                            var spacelessRef = ourDupeRefs[i].ref.replace( /\s/g, "" );
                            var duplicateFullText = allMatchTexts.indexOf( spacelessRef ) !== -1;

                            newInnerElementHtml += "<button class='mw-ui-button " +
                                ( duplicateFullText ? "mw-ui-progressive " : "" ) + "make-self-closing'>" +
                                "Self-close</button>";
                            if( duplicateFullText ) {
                                newInnerElementHtml += "<br /><span class='duplicate-notice'>Duplicated!</span>";
                            } else {

                                // Add this ref to the list so we can check future refs against it
                                allMatchTexts.push( spacelessRef );

                                // Now check for duplicate URLs
                                if( url ) {
                                    if( urls.indexOf( url ) === -1 ) {
                                        urls.push( url );
                                    } else {
                                        newInnerElementHtml += "<br /><span class='duplicate-notice'>Duplicate URL</span>";
                                    }
                                }
                            }
                            newInnerElementHtml += "</div>";
                        }
                        newInnerElementHtml += "</span></li>";
                    }
                }
                newInnerElementHtml += "</ul>";
                newInnerElement.innerHTML = newInnerElementHtml;
                listElement.appendChild( newInnerElement );
            } );
            document.getElementById( "edit-panel" ).appendChild( listElement );

            // Event listeners for "(1 self-closing reference - show)"
            var displaySelfClosing = document.getElementsByClassName( "display-self-closing" );
            for( let i = 0; i < displaySelfClosing.length; i++ ) {
                displaySelfClosing[i].addEventListener( "click", function ( event ) {
                    var listItem = event.target.parentNode;
                    var startingRefnum = 0;
                    var endingRefnum = 0;
                    var refname = "";

                    if( listItem.previousSibling ) {
                        var prevTextarea = listItem.previousSibling.childNodes[0].childNodes[0];
                        startingRefnum = parseInt( prevTextarea.getAttribute( "data-refnum" ) ) + 1;
                        refname = prevTextarea.getAttribute( "data-refname" );
                    }

                    if( listItem.nextSibling ) {
                        var nextTextarea = listItem.nextSibling.childNodes[0].childNodes[0];
                        endingRefnum = parseInt( nextTextarea.getAttribute( "data-refnum" ) ) - 1;
                        refname = nextTextarea.getAttribute( "data-refname" );
                    }

                    if( !refname ) {
                        event.target.disabled = true;
                        event.preventDefault();
                        return;
                    }
                    endingRefnum = ( endingRefnum === 0 ) ? dupeRefs[refname].length - 1 : endingRefnum;

                    var textareas = document.createDocumentFragment();
                    for( var j = startingRefnum; j <= endingRefnum; j++ ) {
                        var currListItem = document.createElement( "li" );
                        currListItem.innerHTML = makeRefListItemHtml( refname, j, false );
                        textareas.appendChild( currListItem );
                    }
                    listItem.innerHTML = "";
                    listItem.appendChild( textareas );

                    // Definition at the end of loadDupeRefNamesView
                    updateTextAreasStyleAndListeners();

                    event.preventDefault();
                }.bind( this ) );
            }

            var selfClosingButtons = document.getElementsByClassName( "make-self-closing" );
            for( let i = 0; i < selfClosingButtons.length; i++ ) {
                selfClosingButtons[i].addEventListener( "click", function ( event ) {
                    var textArea = event.target.parentElement.previousSibling;
                    textArea.value = "<ref name=\"" + textArea.dataset.refname + "\" />";
                    document.getElementById( "save-page" ).disabled = false;
                    event.target.disabled = true;
                }.bind( this ) );
            }

            var savePageButton = document.getElementById( "save-page" );
            savePageButton.disabled = true;

            // Clear event listeners, from http://stackoverflow.com/a/19470348/1757964
            savePageButton.parentNode.replaceChild( savePageButton.cloneNode( /* deep */ true ), savePageButton );
            savePageButton = document.getElementById( "save-page" );

            savePageButton.addEventListener( "click", function () {
                savePageButton.disabled = true;
                savePageButton.innerHTML = "Saving...";
                apiFunctions.getPageText( globals.currentPage ).then( function ( pageText ) {

                    // Apply each textarea's change to the text of the page
                    document.querySelectorAll( "#edit-panel textarea" ).forEach( function ( textArea ) {
                        var refName = textArea.dataset.refname;
                        var refNum = textArea.dataset.refnum;
                        var ref = dupeRefs[refName][refNum];

                        // Get the original text of this ref in the page text
                        var originalRef = ref.ref;

                        // Add context, so if two refs are exactly the same we get the right one
                        var originalText = ref.context[0] + originalRef + ref.context[1];
                        var newText = ref.context[0] + textArea.value + ref.context[1];

                        pageText = pageText.replace( originalText, newText );
                    } );

                    savePageWithInterfaceUpdates( globals.currentPage, pageText,
                            "Fixing duplicate references with YABBR");
                }.bind( this ) );
            }.bind( this ) );

            // Make the text areas taller and give them text listeners
            function updateTextAreasStyleAndListeners() {
                document.querySelectorAll( "#edit-panel textarea" ).forEach( function ( textArea ) {
                    textArea.style.height = textArea.scrollHeight + "px";
                    textArea.addEventListener( "input", function () {
                        document.getElementById( "save-page" ).disabled = false;
                    } );
                } );
            }
            updateTextAreasStyleAndListeners();

            // Successful display happened!
            return true;
        },
        "Category:Miscellaneous redirects": function ( pageText ) {
            var editPanelEl = document.getElementById( "edit-panel" );

            // Reset edit panel text
            editPanelEl.innerHTML = "";

            // Figure out where this page redirects to, and display it
            var REDIR_REGEX = /#[Rr][Ee][Dd][Ii][Rr][Ee][Cc][Tt] \[\[(.+)\]\]/;
            var redirMatch = REDIR_REGEX.exec( pageText );
            if( redirMatch === null ) {
                
                // Can't find a redirect tag
                return false;
            }

            editPanelEl.innerHTML += "<span class='redir-target'>Redirects to " +
                redirMatch[1] + "</span>";

            // Autofill with current tag template, if any
            var TAG_TEMPLATE = /{{(?:Rcat|Redirect category) shell(?:|[\s\S]*)?}}/i;
            var tagMatch = TAG_TEMPLATE.exec( pageText );
            var oldTag = tagMatch ? tagMatch[0] : "";
            editPanelEl.innerHTML += "<br /><input type='text' id='tag-text' " +
                    "value='" + oldTag + "' /><br />";
            var INDEX_LINK = "<a href='https://en.wikipedia.org/wiki/Templ" +
                    "ate:R_template_index' title='R template index on the" +
                    " English Wikipedia'>Index of R templates</a>";
            editPanelEl.innerHTML += INDEX_LINK;
            var savePageButton = document.getElementById( "save-page" );
            document.getElementById( "tag-text" ).addEventListener( "input",
                    function () { savePageButton.disabled = false; } );
            savePageButton.disabled = true;

            // Clear event listeners, from http://stackoverflow.com/a/19470348/1757964
            savePageButton.parentNode.replaceChild( savePageButton.cloneNode( /* deep */ true ), savePageButton );
            savePageButton = document.getElementById( "save-page" );

            savePageButton.addEventListener( "click", function () {
                savePageButton.disabled = true;
                savePageButton.innerHTML = "Saving...";
                apiFunctions.getPageText( globals.currentPage ).then( function ( pageText ) {
                    var newTag = document.getElementById( "tag-text" ).value;
                    pageText = pageText.replace( oldTag, newTag );

                    savePageWithInterfaceUpdates( globals.currentPage, pageText,
                            "Categorizing miscellaneous redirect with YABBR");
                }.bind( this ) );
            }.bind( this ) );
            return true;
        }
    };

    // This event listener is here so that we can access VIEWS
    document.querySelector( "#select-backlog select" ).addEventListener( "change", function () {
        if( !this.value.startsWith( "Category:" ) ) {
            document.getElementById( "backlog-size" ).innerHTML = "";
            return;
        }

        // Load and display backlog size
        globals.currentCat = this.value;
        globals.currentView = VIEWS[ globals.currentCat ];
        updateCategorySize();

        // Load first page
        globals.iterator = new CategoryIterator( globals.currentCat );
        nextPage();
    } );

    /**
     * Saves a page, while changing the interface. Ideally, the calling
     * method doesn't have any code that alters the HTML on the page at
     * all, with two exceptions: the caller is responsible for disabling
     * the save button and changing its text at the beginning of the
     * handler. This function will take care of everything else,
     * including manipulating the #save-results div.
     */
    function savePageWithInterfaceUpdates( pageName, newText, summary ) {
        var saveIndicator = document.getElementById( "save-indicator" );
        globals.pendingEdits++;
        saveIndicator.textContent = globals.pendingEdits;
        saveIndicator.className = "active";

        var editProgressElement = document.createElement( "span" );
        editProgressElement.className = "edit-progress pending";
        editProgressElement.textContent = "Saving " + pageName + "...";
        var editProgressContainer = document.getElementById( "save-results" );

        // If this is our first edit, clear out notices & junk from save-results first
        if( globals.numSessionEdits === 0 ) {
            while( editProgressContainer.firstChild.id !== "save-statistics" ) {
                editProgressContainer.removeChild( editProgressContainer.firstChild );
            }
        }
        editProgressContainer.insertBefore( editProgressElement, editProgressContainer.firstChild );

        nextPage();
        savePageButton = document.getElementById( "save-page" );
        savePageButton.innerHTML = "Save page";

        // Save our changes to the page text
        apiFunctions.savePage( pageName, newText, summary )
            .then( function ( response ) {
                globals.pendingEdits--;
                globals.numSessionEdits++;
                try {
                    response = JSON.parse( response );
                    var articleTitle = response["edit"]["title"];
                    var result = response["edit"]["result"];
                    editProgressElement.innerHTML = "Edit to ";
                    editProgressElement.appendChild( makeWikilink( articleTitle ) );
                    editProgressElement.lastChild.href += "?redirect=no";
                    editProgressElement.innerHTML += " &rarr; " + result;
                    if( response["edit"]["result"] === "Success" ) {
                        editProgressElement.innerHTML += " (<a href='https://en.wikipedia.org/w/index.php?title=" + articleTitle.replace( "'", "%27" ) + "&diff=prev&oldid=" + response["edit"]["newrevid"] + "'>diff</a>)";
                        editProgressElement.className = "edit-progress success";
                    } else {
                        editProgressElement.className = "edit-progress failure";
                    }
                    saveIndicator.textContent = globals.pendingEdits;
                    saveIndicator.className = ( globals.pendingEdits > 0 ) ? "active" : "";
                    var saveCounter = document.getElementById( "save-statistics-counter" );
                    saveCounter.innerHTML = globals.numSessionEdits + " edit" +
                        ( globals.numSessionEdits === 1 ? "" : "s" );
                } catch ( e ) {
                    editProgressElement.innerHTML = "Error parsing server response!";
                    editProgressElement.className = "edit-progress failure";
                    console.log(e);
                    console.log(response);
                }

                setTimeout( updateCategorySize, 500 );
                setTimeout( updateCategorySize, 1500 );
            } );
    }


    var apiFunctions = {
        getCategorySize: function ( categoryName ) {
            return new Promise( function ( resolve, reject ) {
                makeApiCall( {
                    "action": "query",
                    "prop": "categoryinfo",
                    "titles": categoryName
                } ).then( function ( data ) {
                    try {
                        var pageId = Object.keys( data.query.pages )[0];
                        resolve( data.query.pages[ pageId ].categoryinfo.size );
                    } catch( e ) {
                        reject();
                    }
                } );
            } );
        },
        getPageText: function ( pageName ) {
            return new Promise( function ( resolve, reject ) {
                makeApiCall( {
                    "action": "query",
                    "prop": "revisions",
                    "titles": pageName,
                    "rvprop": "content",
                } ).then( function ( data ) {
                    try {
                        var pageId = Object.keys( data.query.pages )[0];
                        resolve( data.query.pages[ pageId ].revisions[0]["*"] );
                    } catch( e ) {
                        reject();
                    }
                } );
            } );
        },
        savePage: function ( pageName, newText, editSummary ) {
            return new Promise( function ( resolve, reject ) {
                var xhr = new XMLHttpRequest();
                xhr.onreadystatechange = function() {
                    if ( xhr.readyState == XMLHttpRequest.DONE ) {
                        resolve(xhr.response);
                    }
                };
                xhr.open( "POST", "edit" );
                xhr.setRequestHeader( "Content-Type","application/x-www-form-urlencoded" );
                var params = "text=" + encodeURIComponent( newText ) + "&title=" +
                    encodeURIComponent( pageName ) + "&summary=" + editSummary;
                try{
                    xhr.send( params );
                } catch( e ) {
                    console.log(e);
                    reject(e);
                }
            } );
        }
    };

    /*
     * Caution: because we sometimes need to make an API call in next(), the
     * whole thing has to be async, so the CategoryIterator doesn't meet the
     * Iterator protocol.
     */
    function CategoryIterator( name ) {
        this.name = name;
        this.index = 0;

        // Category member objects from the API responses
        this.rawMembers = [];

        /*
         * random is a boolean that is true if we're fetching a
         * completely random next set of pages, and false if we're
         * operating normally and just fetching the (alphabetically
         * next) set of pages.
         *
         * For "Skip page" and "Save page", random will be false; for
         * "Skip to random page", random will be true.
         */
        this.next = function ( random ) {
            return new Promise( function ( resolve, reject ) {
                if( !random && ( this.index < this.rawMembers.length ) ) {
                    var potentialTitle = this.rawMembers[ this.index++ ].title;
                    resolve( potentialTitle );
                } else {
                    var apiParams = {
                        "action": "query",
                        "list": "categorymembers",
                        "cmtitle": this.name,
                        "cmprop": "title|sortkey"
                    };
                    if( random ) {

                        // Generate a random alphanumeric string
                        apiParams.cmstartsortkeyprefix = Math.random().toString(36).slice(2).substr(0,1);
                    } else if( this.rawMembers.length ) {
                        apiParams.cmstarthexsortkey = this.rawMembers[ this.rawMembers.length - 1 ].sortkey;
                    }
                    makeApiCall( apiParams ).then( function ( data ) {
                        try {
                            this.rawMembers = data.query.categorymembers;
                            this.index = 0;
                            if( this.rawMembers.length ) {
                                potentialPage = this.rawMembers[ this.index++ ].title;

                                // For Category:Miscellaneous redirects, we don't want to
                                // return the redirect category shell template, so special-
                                // case in a skip there
                                if( globals.currentCat === "Category:Miscellaneous redirects" &&
                                    potentialPage !== "Template:Redirect category shell" ) {
                                    resolve( potentialPage );
                                } else {
                                    resolve( this.rawMembers[ this.index++ ].title );
                                }
                            } else {
                                reject( "No members returned from API" );
                            }
                        } catch ( e ) {
                            reject( e );
                        }
                    }.bind( this ) );
                }
            }.bind( this ) );
        };
    }

    function makeWikilink( pageName, linkLabel ) {
        linkLabel = linkLabel || pageName;
        var link = document.createElement( "a" );
        link.href = "https://en.wikipedia.org/wiki/" + encodeURIComponent( pageName );
        link.appendChild( document.createTextNode( linkLabel ) );
        link.title = pageName + " on the English Wikipedia";
        return link;
    }

    const API_ROOT = "https://en.wikipedia.org/w/api.php",
        API_SUFFIX = "&format=json&callback=?&continue=";
    function makeApiUrl( params ) {
        var paramString = Object.keys( params ).map( function ( key ) {
            return encodeURIComponent( key ) + "=" + encodeURIComponent( params[key] );
        } ).join( "&" );
        return API_ROOT + "?" + paramString + API_SUFFIX;
    }

    function makeApiCall( params ) {
        return loadJsonp( makeApiUrl( params ) );
    }

    // Adapted from https://gist.github.com/gf3/132080/110d1b68d7328d7bfe7e36617f7df85679a08968
    var jsonpUnique = 0;
    function loadJsonp(url) {
        var unique = jsonpUnique++;
        return new Promise( function ( resolve ) {
            var name = "_jsonp_" + unique;
            if (url.match(/\?/)) url += "&callback="+name;
            else url += "?callback="+name;
            var script = document.createElement("script");
            script.type = "text/javascript";
            script.src = url;
            window[name] = function(data) {
                resolve(data);
                document.getElementsByTagName("head")[0].removeChild(script);
                script = null;
                delete window[name];
            };
            document.getElementsByTagName("head")[0].appendChild(script);
        } );
    }

    function getRedirectTarget( url ) {
        return new Promise( function ( resolve ) {
            var xhr = new XMLHttpRequest();
            xhr.open( "GET", url, true );
            xhr.onload = function () {
                resolve( xhr.responseURL );
            };
            xhr.send( null );
        } );
    }

    // From http://stackoverflow.com/a/12034334/1757964
    var entityMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
        "/": "&#x2F;",
        "`": "&#x60;",
        "=": "&#x3D;"
    };

    function escapeHtml (string) {
        return String(string).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s];
        } );
    }

    // ONLOAD STUFF

    // Update the backlog-dependent display stuff
    document.querySelector( "#select-backlog select" ).dispatchEvent( new Event( "change" ) );

    // Set the dropdown coords correctly
    var skipPageDropdownContainer = document.getElementById( "skip-page-dropdown-container" );
    var skipPageToggleBox = document.getElementById( "skip-page-dropdown-toggle" )
        .getBoundingClientRect();
    skipPageDropdownContainer.style.top = skipPageToggleBox.bottom + "px";
    skipPageDropdownContainer.style.right = ( window.innerWidth - skipPageToggleBox.right ) + "px";
} );
