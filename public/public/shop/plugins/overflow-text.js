(function($) {
    /*==============================
        Overflow text plugin
    ==============================*/
    $.fn.numberLine = function(opts) {
        $(this).each( function () {
            var $this = $(this),
            defaults = {
                numberLine: 0
            },
            data = $this.data(),
            dataTemp = $.extend(defaults, opts),
            options = $.extend(dataTemp, data);

            if (!options.numberLine)
                return false;

            $this.bind('customResize', function(event) {
                event.stopPropagation();
                reInit();
            }).trigger('customResize');
            $(window).resize( function () {
                $this.trigger('customResize');
            });
            function reInit() {
                var fontSize = parseInt($this.css('font-size')),
                    lineHeight = parseInt($this.css('line-height')),
                    overflow = fontSize * (lineHeight / fontSize) * options.numberLine;

                $this.css({
                    'display': 'block',
                    'max-height': overflow,
                    'overflow': 'hidden'
                });
            }
        });
    };
    $('[data-number-line]').numberLine();

})(jQuery);