function showSubMenu(e) {
  e.preventDefault();
  let className = e.target.dataset.value;
  $('.'+ className).next().toggleClass('active');
}

// $(window).scroll(function(e){
//   let $el = $('.search-bar');
//   let $el1 = $('.hr-rule');
//   let $el2 = $('.view');
//   let isPositionFixed = ($el.css('position') == 'fixed');
//   if ($(this).scrollTop() > 1 && !isPositionFixed){
//     $el.css({'position': 'fixed', 'top': '3%', 'z-index': '10'});
//     $el1.css({'position': 'fixed', 'top': '7%', 'z-index': '10'});
//     $el2.css({'position': 'fixed', 'top': '3%', 'z-index': '10'});
//   }
//   if ($(this).scrollTop() < 1 && isPositionFixed){
//     $el.css({'position': 'absolute', 'top': '3%'});
//     $el1.css({'position': 'absolute', 'top': '7%'});
//     $el2.css({'position': 'absolute', 'top': '3%'});
//   }
// });
