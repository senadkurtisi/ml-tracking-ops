$(document).ready(function () {
  let navigationTabs = [...document.getElementsByClassName("nav-item")];

  navigationTabs.forEach((element, index) => {
    element.addEventListener("click", () => {
      navigationTabs[i].classList.remove("active-tab");
    });
  });
});
