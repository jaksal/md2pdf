#!/usr/bin/env node
'use strict';
var path = require('path');
var fs = require('fs');
var url = require('url');

var program = require('commander');
program
    .version('0.0.1')
    .option('-i, --input <path>', 'input md file')
    .option('-o, --output <path>', 'output pdf file')
    .option('-b, --breaks', 'enable line breaks')
    .option('-t, --type [value]', 'output format: pdf, html', 'pdf')
    .option('-s, --styles [value]', 'style sheet file list', '')
    .option('-e, --emoji', 'enable emoji')
    .option('-d, --debug', 'debug mode')
    .parse(process.argv);

init();
run(program.input, program.output);

function run(input, output) {
    console.log("input : ", input)
    console.log("output : ", output)
    console.log("type : ", program.type)

    var ext = path.extname(input);
    if (!isExistsFile(input)) {
        console.error('File name does not get!');
        return;
    }

    // convert markdown to html
    var content = convertMarkdownToHtml(input);

    // make html
    var html = makeHtml(content);

    var type = program.type;
    var types = ['html', 'pdf', 'png', 'jpeg'];
    var filename = '';
    // export html
    if (type == 'html') {
        filename = input.replace(ext, '.' + type);
        filename = getOutputDir(output);
        exportHtml(html, output);
        // export pdf/png/jpeg
    } else if (types.indexOf(type) >= 1) {
        filename = input.replace(ext, '.' + type);
        filename = getOutputDir(output);
        exportPdf(html, output);

        var debug = program.debug;
        if (debug) {
            var f = path.parse(input);
            filename = path.join(f.dir, f.name + '_debug.html');
            filename = getOutputDir(filename);
            exportHtml(html, filename);
        }
    } else {
        console.log('ERROR: Supported formats: html, pdf, png, jpeg.');
        return;
    }

}


/*
 * convert markdown to html (markdown-it)
 */
function convertMarkdownToHtml(filename) {
    var hljs = require('highlight.js');
    var breaks = program.breaks;
    try {
        var md = require('markdown-it')({
            html: true,
            breaks: breaks,
            highlight: function (str, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        str = hljs.highlight(lang, str, true).value;
                    } catch (e) {
                        str = md.utils.escapeHtml(str);

                        console.log('ERROR: markdown-it:highlight');
                        console.log(e.message);
                    }
                } else {
                    str = md.utils.escapeHtml(str);
                }
                return '<pre class="hljs"><code><div>' + str + '</div></code></pre>';
            }
        });
    } catch (e) {
        console.log('ERROR: require(\'markdown-it\')');
        console.log(e.message);
    }

    // convert the img src of the markdown
    var type = program.type;
    var cheerio = require('cheerio');
    var defaultRender = md.renderer.rules.image;
    md.renderer.rules.image = function (tokens, idx, options, env, self) {
        var token = tokens[idx];
        var href = token.attrs[token.attrIndex('src')][1];
        if (type === 'html') {
            href = decodeURIComponent(href).replace(/("|')/g, '');
        } else {
            href = convertImgPath(href, filename);
        }
        token.attrs[token.attrIndex('src')][1] = href;
        // pass token to default renderer.
        return defaultRender(tokens, idx, options, env, self);
    };

    if (type !== 'html') {
        // convert the img src of the html
        md.renderer.rules.html_block = function (tokens, idx) {
            var html = tokens[idx].content;
            var $ = cheerio.load(html);
            $('img').each(function () {
                var src = $(this).attr('src');
                var href = convertImgPath(src, filename);
                $(this).attr('src', href);
            });
            return $.html();
        };
    }

    // checkbox
    md.use(require('markdown-it-checkbox'));

    // emoji
    var f = program.emoji;
    if (f) {
        var emojies_defs = require(path.join(__dirname, 'data', 'emoji.json'));
        try {
            var options = {
                defs: emojies_defs
            };
        } catch (e) {
            console.log('ERROR: markdown-it-emoji:options');
            console.log(e.message);
        }
        md.use(require('markdown-it-emoji'), options);
        md.renderer.rules.emoji = function (token, idx) {
            var emoji = token[idx].markup;
            var emojipath = path.join(__dirname, 'node_modules', 'emoji-images', 'pngs', emoji + '.png');
            var emojidata = readFile(emojipath, null).toString('base64');
            if (emojidata) {
                return '<img class="emoji" alt="' + emoji + '" src="data:image/png;base64,' + emojidata + '" />';
            } else {
                return ':' + emoji + ':';
            }
        };
    }
    return md.render(fs.readFileSync(filename, 'utf-8'));
}


/*
 * make html
 */
function makeHtml(data) {
    // read styles
    var style = '';
    style += readStyles();

    // read template
    var filename = path.join(__dirname, 'template', 'template.html');
    // console.log("template path", filename, __dirname)
    var template = readFile(filename);

    // compile template
    var mustache = require('mustache');

    try {
        var view = {
            style: style,
            content: data
        };
    } catch (e) {
        console.log('ERROR: mustache:view');
        console.log(e.message);
    }

    return mustache.render(template, view);
}

/*
 * export a html to a html file
 */
function exportHtml(data, filename) {
    console.log('HTML Converting...');
    fs.writeFile(filename, data, 'utf-8', function (err) {
        if (err) {
            console.log('ERROR: exportHtml()');
            console.log(err.message);
            return;
        }
        console.log('HTML OUTPUT : ' + filename);
    });
}

/*
 * export a html to a pdf file (html-pdf)
 */
function exportPdf(data, filename) {
    console.log('PDF Converting...');
    var phantomPath = getPhantomjsPath();
    if (!checkPhantomjs()) {
        installPhantomjsBinary();
    }
    if (!checkPhantomjs()) {
        console.log('ERROR: phantomjs binary does not exist: ' + phantomPath);
        return;
    }

    var htmlpdf = require('html-pdf');
    try {
        var options = {
            "format": 'A4',
            "orientation": 'portrait',
            "border": {
                "top": '',
                "right": '',
                "bottom": '',
                "left": ''
            },
            "type": 'pdf',
            "quality": 90,
            "header": {
                "height": '',
                "contents": ''
            },
            "footer": {
                "height": '',
                "contents": ''
            },
            "phantomPath": phantomPath
        };
    } catch (e) {
        console.log('ERROR: html-pdf:options');
        console.log(e.message);
    }

    try {
        var cr = htmlpdf.create(data, options)
        // console.log("start pdf", filename)
        cr.toBuffer(function (err, buffer) {
            // console.log("buffer", err, buffer, filename)
            fs.writeFile(filename, buffer, function (err) {
                if (err) {
                    console.log('ERROR: exportPdf()');
                    console.log(err.message);
                    return;
                }
                console.log('PDF OUTPUT : ' + filename);
            });
        });
    } catch (e) {
        console.log('ERROR: htmlpdf.create()');
        console.log(e.message);
    }
}


function isExistsFile(filename) {
    if (filename.length === 0) {
        return false;
    }
    try {
        if (fs.statSync(filename).isFile()) {
            return true;
        }
    } catch (e) {
        console.warn(e.message);
        return false;
    }
}

function isExistsDir(dirname) {
    if (dirname.length === 0) {
        return false;
    }
    try {
        if (fs.statSync(dirname).isDirectory()) {
            return true;
        } else {
            console.warn('undefined');
            return false;
        }
    } catch (e) {
        console.warn('false : ' + e.message);
        return false;
    }
}

function getOutputDir(filename) {
    var output_dir = '';
    if (output_dir.length !== 0) {
        if (isExistsDir(output_dir)) {
            return path.join(output_dir, path.basename(filename));
        } else {
            console.log('Output directory does not exist! (markdown-pdf.outputDirectory) : ' + output_dir);
            return filename;
        }
    }
    return filename;
}

function readFile(filename, encode) {
    if (filename.length === 0) {
        return '';
    }
    if (!encode && encode !== null) {
        encode = 'utf-8';
    }
    if (filename.indexOf('file://') === 0) {
        if (process.platform === 'win32') {
            filename = filename.replace(/^file:\/\/\//, '')
                .replace(/^file:\/\//, '');
        } else {
            filename = filename.replace(/^file:\/\//, '');
        }
    }
    if (isExistsFile(filename)) {
        return fs.readFileSync(filename, encode);
    } else {
        return '';
    }
}

function convertImgPath(src, filename) {
    var href = decodeURIComponent(src);
    href = href.replace(/("|')/g, '')
        .replace(/\\/g, '/')
        .replace(/#/g, '%23');
    var protocol = url.parse(href).protocol;
    if (protocol === 'file:' && href.indexOf('file:///') !== 0) {
        return href.replace(/^file:\/\//, 'file:///');
    } else if (protocol === 'file:') {
        return href;
    } else if (!protocol || path.isAbsolute(href)) {
        href = path.resolve(path.dirname(filename), href).replace(/\\/g, '/')
            .replace(/#/g, '%23');
        if (href.indexOf('//') === 0) {
            return 'file:' + href;
        } else if (href.indexOf('/') === 0) {
            return 'file://' + href;
        } else {
            return 'file:///' + href;
        }
    } else {
        return src;
    }
}

function makeCss(filename) {
    var css = readFile(filename);
    if (css) {
        return '\n<style>\n' + css + '\n</style>\n';
    } else {
        return '';
    }
}

function readStyles() {
    var style = '';
    var styles = '';
    var filename = '';
    var i;

    // 1. read the style of the vscode.
    filename = path.join(__dirname, 'styles', 'markdown.css');
    style += makeCss(filename);

    // 2. read the style of the markdown.styles setting.
    styles = program.styles;
    if (styles && Array.isArray(styles) && styles.length > 0) {
        for (i = 0; i < styles.length; i++) {
            var href = filename = styles[i];
            var protocol = url.parse(href).protocol;
            if (protocol === 'http:' || protocol === 'https:') {
                style += '<link rel=\"stylesheet\" href=\"" + href + "\" type=\"text/css\">';
            } else if (protocol === 'file:') {
                style += makeCss(filename);
            }
        }
    }

    // 3. read the style of the highlight.js.
    var highlightStyle = '';
    var ishighlight = true;
    if (ishighlight) {
        if (highlightStyle) {
            var css = 'github.css';
            filename = path.join(__dirname, 'node_modules', 'highlight.js', 'styles', css);
            style += makeCss(filename);
        } else {
            filename = path.join(__dirname, 'styles', 'tomorrow.css');
            style += makeCss(filename);
        }
    }

    // 4. read the style of the markdown-pdf.
    filename = path.join(__dirname, 'styles', 'markdown-pdf.css');
    style += makeCss(filename);

    // 5. read the style of the markdown-pdf.styles settings.
    styles = program.styles;
    if (styles && Array.isArray(styles) && styles.length > 0) {
        for (i = 0; i < styles.length; i++) {
            filename = styles[i];
            if (!path.isAbsolute(filename)) {
                if (vscode.workspace.rootPath == undefined) {
                    filename = path.join(path.dirname(mdfilename), filename);
                } else {
                    filename = path.join(vscode.workspace.rootPath, filename);
                }
            }
            style += makeCss(filename);
        }
    }

    return style;
}

function getPhantomjsPath() {
    // for reload phantomjs binary path
    delete require.cache[path.join(__dirname, 'node_modules', 'phantomjs-prebuilt', 'lib', 'location.js')];
    delete require.cache[path.join(__dirname, 'node_modules', 'phantomjs-prebuilt', 'lib', 'phantomjs.js')];
    // load phantomjs binary path
    var phantomPath = require(path.join(__dirname, 'node_modules', 'phantomjs-prebuilt', 'lib', 'phantomjs')).path;
    return phantomPath;
}

function checkPhantomjs() {
    var phantomPath = getPhantomjsPath();
    if (isExistsFile(phantomPath)) {
        return true;
    } else {
        return false;
    }
}

function installPhantomjsBinary() {
    // which npm
    var which = require('which');
    var npm = '';
    try {
        npm = which.sync('npm');
    } catch (e) {
        console.warn(e.message);
    }

    // which node
    var node = '';
    try {
        node = which.sync('node');
    } catch (e) {
        console.warn(e.message);
    }

    // npm rebuild phantomjs-prebuilt
    var execSync = require('child_process').execSync;
    if (isExistsFile(npm) && isExistsFile(node)) {
        try {
            var std = execSync('npm rebuild phantomjs-prebuilt', { cwd: __dirname });
            console.log(std.toString());
        } catch (e) {
            console.log('ERROR: "npm rebuild phantomjs-prebuilt"');
            console.log(e.message);
        }
    } else {
        // node_modules/phantomjs-prebuilt/install.js
        var install = path.join(__dirname, 'node_modules', 'phantomjs-prebuilt', 'install.js').replace(/\\/g, '/');
        try {
            if (isExistsFile(install)) {
                require(install);
            }
        } catch (e) {
            console.error(e.message);
        }
    }

    if (checkPhantomjs()) {
        return;
    }
}

function init() {
    console.log("check pandomjs...")
    if (!checkPhantomjs()) {
        installPhantomjsBinary();
    }
}
