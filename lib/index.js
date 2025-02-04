'use strict';

var log = hexo.log || log.log;
var headingStyleParser = require('./heading-style-parser');
var indexMaker = require('./index-maker');
var cheerio = require('cheerio');

var headingIndexFactories = {
    '0' : (index, format, padding) => indexMaker.makeNumberIndex(index, format, padding),
    '1' : (index, format, padding) => indexMaker.makeNumberIndex(index + 1, format, padding),
    'i' : (index) => indexMaker.makeRomanNumeralIndex(index + 1, false),
    'I' : (index) => indexMaker.makeRomanNumeralIndex(index + 1, true),
    'a' : (index ) => indexMaker.makeLetterIndex(index, false),
    'A' : (index ) => indexMaker.makeLetterIndex(index, true),
};

hexo.extend.filter.register('after_post_render', function(postInfo) {
    var config = hexo.config.heading_index;
    if (!config || !config.enable) {
        return;
    }

    if (postInfo.heading_disabled) {
        return;
    }

    var index_styles = postInfo.heading_index_styles ? postInfo.heading_index_styles : config.index_styles;

    var options = {
        "indexStyles" : headingStyleParser.parse(index_styles),
        "connector" : config.connector ? config.connector : '',
        "globalPrefix" : config.global_prefix ? config.global_prefix : '',
        "globalSuffix" : config.global_suffix ? config.global_suffix : '',
        "allowHtml": !!config.allow_html,

        // We treat start_level as numbers starting from 1 instead of 0, because the first heading is h1 not h0.
        "startLevel" : config.start_level ? config.start_level : (postInfo.heading_start_level ? postInfo.heading_start_level : 1),
    };

    var contentKeys = ['content', 'excerpt'];
    contentKeys.forEach((contentKey) => {
        postInfo[contentKey] = updateHeadingIndexes(options, postInfo[contentKey]);
    });

    log.log("Heading index added: " + postInfo.path);
});

function updateHeadingIndexes(options, data) {
    var $ = cheerio.load(data, { xml: { xmlMode: false, decodeEntities: false } });
    var headings = $('h1, h2, h3, h4, h5, h6');

    var headingContextStack = [];
    headingContextStack.push({ level: 0, index: -1 });

    headings.each(function () {
        var currentContext = headingContextStack[headingContextStack.length - 1];

        var heading = $(this);
        var headingLevel = parseInt(heading[0].name.replace('h', ''));

        if (headingLevel > options.startLevel) {
            headingLevel -= (options.startLevel - 1);
        } else {
            headingLevel = 1;
        }

        if (headingLevel > currentContext.level) {
            // Push the nested context, one by one.
            while (headingLevel > currentContext.level) {
                currentContext = { level: currentContext.level + 1, index: -1 };
                headingContextStack.push(currentContext);
            }
        } else if (headingLevel < currentContext.level) {
            // Pop all the nested contexts.
            while (headingLevel < currentContext.level) {
                headingContextStack.pop();
                currentContext = headingContextStack[headingContextStack.length - 1];
            }
        }

        // Here the current context should have exactly the same heading level as we get from the tag name.
        // Adding heading index to the current context.
        ++currentContext.index;

        var headingIndex = createHeadingIndex(options, headingContextStack);

        if (options.allowHtml) {
            var headingTitle = headingIndex + heading.html();
            log.d("Heading after adding index (HTML enabled): " + headingTitle);
            heading.html(headingTitle);
        } else {
            var headingTitle = headingIndex + heading.text();
            log.d("Heading after adding index (Text only): " + headingTitle);
            heading.text(headingTitle);
        }
    });

    return $.html();
}

function createHeadingIndex(options, headingContextStack) {
    var indexOfEachLevel = [];

    // Ignore the first element, because it is there for simplifying the code.
    for (var i = 1; i < headingContextStack.length; ++i) {
        var headingContext = headingContextStack[i];

        if (options.indexStyles.length < headingContext.level) {
            throw "No index style defined in the configuration: Level = " + headingContext.level;
        }

        // style = { prefix: '', suffix: '', style: null, format: null, padding: 0 };
        var index = '';
        var indexStyleOption = options.indexStyles[headingContext.level - 1];
        if (indexStyleOption.style === null) {
            index = indexStyleOption.prefix;
        } else {
            var headingIndexFactory = headingIndexFactories[indexStyleOption.style];
            if (!headingIndexFactory) {
                throw "Unknown index style: " + indexStyleOption.style;
            }

            index = headingIndexFactory(headingContext.index, indexStyleOption.format, indexStyleOption.padding);
        }

        indexOfEachLevel.push(index);
    }

    return [options.globalPrefix, indexOfEachLevel.join(options.connector), options.globalSuffix].join('');
}
