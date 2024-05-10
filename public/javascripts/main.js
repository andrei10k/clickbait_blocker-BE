$(function () {
  $.ajax({
    url: 'https://yourAPI',
    method: 'GET',
    success: function (response) {
      $('.view-wrapper').html(response)
    }
  })
})
