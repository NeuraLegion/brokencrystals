import React, { FC } from 'react';

export const Detail: FC = () => {
  return (
    <>
      <div className="test">
        <div className="container">
          <div className="row">
            <div className="col-lg-4 col-md-4 col-sm-4 col-xs-4 " />
          </div>
        </div>
      </div>
      <div className="ps-product--detail pt-60">
        <div className="ps-container">
          <div className="row">
            <div className="col-lg-10 col-md-12 col-lg-offset-1">
              <div className="ps-product__thumbnail">
                <div className="ps-product__preview">
                  <div className="ps-product__variants">
                    <div className="item">
                      <img src="shop/images/shoe-detail/1.jpg" alt="" />
                    </div>
                    <div className="item">
                      <img src="shop/images/shoe-detail/2.jpg" alt="" />
                    </div>
                    <div className="item">
                      <img src="shop/images/shoe-detail/3.jpg" alt="" />
                    </div>
                    <div className="item">
                      <img src="shop/images/shoe-detail/3.jpg" alt="" />
                    </div>
                    <div className="item">
                      <img src="shop/images/shoe-detail/3.jpg" alt="" />
                    </div>
                  </div>
                  <a
                    className="popup-youtube ps-product__video"
                    href="http://www.youtube.com/watch?v=0O2aH4XLbto"
                  >
                    <img src="shop/images/shoe-detail/1.jpg" alt="" />
                    <i className="fa fa-play" />
                  </a>
                </div>
                <div className="ps-product__image">
                  <div className="item">
                    <img
                      className="zoom"
                      src="shop/images/shoe-detail/1.jpg"
                      alt=""
                      data-zoom-image="images/shoe-detail/1.jpg"
                    />
                  </div>
                  <div className="item">
                    <img
                      className="zoom"
                      src="shop/images/shoe-detail/2.jpg"
                      alt=""
                      data-zoom-image="images/shoe-detail/2.jpg"
                    />
                  </div>
                  <div className="item">
                    <img
                      className="zoom"
                      src="shop/images/shoe-detail/3.jpg"
                      alt=""
                      data-zoom-image="images/shoe-detail/3.jpg"
                    />
                  </div>
                </div>
              </div>
              <div className="ps-product__thumbnail--mobile">
                <div className="ps-product__main-img">
                  <img src="shop/images/shoe-detail/1.jpg" alt="" />
                </div>
                <div
                  className="ps-product__preview owl-slider"
                  data-owl-auto="true"
                  data-owl-loop="true"
                  data-owl-speed="5000"
                  data-owl-gap="20"
                  data-owl-nav="true"
                  data-owl-dots="false"
                  data-owl-item="3"
                  data-owl-item-xs="3"
                  data-owl-item-sm="3"
                  data-owl-item-md="3"
                  data-owl-item-lg="3"
                  data-owl-duration="1000"
                  data-owl-mousedrag="on"
                >
                  <img src="shop/images/shoe-detail/1.jpg" alt="" />
                  <img src="shop/images/shoe-detail/2.jpg" alt="" />
                  <img src="shop/images/shoe-detail/3.jpg" alt="" />
                </div>
              </div>
              <div className="ps-product__info">
                <div className="ps-product__rating">
                  <select className="ps-rating">
                    <option value="1">1</option>
                    <option value="1">2</option>
                    <option value="1">3</option>
                    <option value="1">4</option>
                    <option value="2">5</option>
                  </select>
                  <a href="#">(Read all 8 reviews)</a>
                </div>
                <h1>Air strong training</h1>
                <p className="ps-product__category">
                  <a href="#"> Men shoes</a>,<a href="#"> Nike</a>,
                  <a href="#"> Jordan</a>
                </p>
                <h3 className="ps-product__price">
                  £ 115 <del>£ 330</del>
                </h3>
                <div className="ps-product__block ps-product__quickview">
                  <h4>QUICK REVIEW</h4>
                  <p>
                    The Nike Free RN 2017 Men's Running Sky weighs less than
                    previous versions and features an updated knit material…
                  </p>
                </div>
                <div className="ps-product__block ps-product__style">
                  <h4>CHOOSE YOUR STYLE</h4>
                  <ul>
                    <li>
                      <a href="product-detail.html">
                        <img src="shop/images/shoe/sidebar/1.jpg" alt="" />
                      </a>
                    </li>
                    <li>
                      <a href="product-detail.html">
                        <img src="shop/images/shoe/sidebar/2.jpg" alt="" />
                      </a>
                    </li>
                    <li>
                      <a href="product-detail.html">
                        <img src="shop/images/shoe/sidebar/3.jpg" alt="" />
                      </a>
                    </li>
                    <li>
                      <a href="product-detail.html">
                        <img src="shop/images/shoe/sidebar/2.jpg" alt="" />
                      </a>
                    </li>
                  </ul>
                </div>
                <div className="ps-product__block ps-product__size">
                  <h4>
                    CHOOSE SIZE<a href="#">Size chart</a>
                  </h4>
                  <select className="ps-select selectpicker">
                    <option value="1">Select Size</option>
                    <option value="2">4</option>
                    <option value="3">4.5</option>
                    <option value="3">5</option>
                    <option value="3">6</option>
                    <option value="3">6.5</option>
                    <option value="3">7</option>
                    <option value="3">7.5</option>
                    <option value="3">8</option>
                    <option value="3">8.5</option>
                    <option value="3">9</option>
                    <option value="3">9.5</option>
                    <option value="3">10</option>
                  </select>
                  <div className="form-group">
                    <input className="form-control" type="number" value="1" />
                  </div>
                </div>
                <div className="ps-product__shopping">
                  <a className="ps-btn mb-10" href="cart.html">
                    Add to cart
                    <i className="ps-icon-next" />
                  </a>
                  <div className="ps-product__actions">
                    <a className="mr-10" href="whishlist.html">
                      <i className="ps-icon-heart" />
                    </a>
                    <a href="compare.html">
                      <i className="ps-icon-share" />
                    </a>
                  </div>
                </div>
              </div>
              <div className="clearfix" />
              <div className="ps-product__content mt-50">
                <ul className="tab-list" role="tablist">
                  <li className="active">
                    <a
                      href="#tab_01"
                      aria-controls="tab_01"
                      role="tab"
                      data-toggle="tab"
                    >
                      Overview
                    </a>
                  </li>
                  <li>
                    <a
                      href="#tab_02"
                      aria-controls="tab_02"
                      role="tab"
                      data-toggle="tab"
                    >
                      Review
                    </a>
                  </li>
                  <li>
                    <a
                      href="#tab_03"
                      aria-controls="tab_03"
                      role="tab"
                      data-toggle="tab"
                    >
                      PRODUCT TAG
                    </a>
                  </li>
                  <li>
                    <a
                      href="#tab_04"
                      aria-controls="tab_04"
                      role="tab"
                      data-toggle="tab"
                    >
                      ADDITIONAL
                    </a>
                  </li>
                </ul>
              </div>
              <div className="tab-content mb-60">
                <div className="tab-pane active" role="tabpanel" id="tab_01">
                  <p>
                    Caramels tootsie roll carrot cake sugar plum. Sweet roll
                    jelly bear claw liquorice. Gingerbread lollipop dragée cake.
                    Pie topping jelly-o. Fruitcake dragée candy canes tootsie
                    roll. Pastry jelly-o cupcake. Bonbon brownie soufflé muffin.
                  </p>
                  <p>
                    Sweet roll soufflé oat cake apple pie croissant. Pie gummi
                    bears jujubes cake lemon drops gummi bears croissant
                    macaroon pie. Fruitcake tootsie roll chocolate cake Carrot
                    cake cake bear claw jujubes topping cake apple pie. Jujubes
                    gummi bears soufflé candy canes topping gummi bears cake
                    soufflé cake. Cotton candy soufflé sugar plum pastry sweet
                    roll..
                  </p>
                </div>
                <div className="tab-pane" role="tabpanel" id="tab_02">
                  <p className="mb-20">
                    1 review for <strong>Shoes Air Jordan</strong>
                  </p>
                  <div className="ps-review">
                    <div className="ps-review__thumbnail">
                      <img src="shop/images/user/1.jpg" alt="" />
                    </div>
                    <div className="ps-review__content">
                      <header>
                        <select className="ps-rating">
                          <option value="1">1</option>
                          <option value="1">2</option>
                          <option value="1">3</option>
                          <option value="1">4</option>
                          <option value="5">5</option>
                        </select>
                        <p>
                          By<a href=""> Alena Studio</a> - November 25, 2017
                        </p>
                      </header>
                      <p>
                        Soufflé danish gummi bears tart. Pie wafer icing.
                        Gummies jelly beans powder. Chocolate bar pudding
                        macaroon candy canes chocolate apple pie chocolate cake.
                        Sweet caramels sesame snaps halvah bear claw wafer.
                        Sweet roll soufflé muffin topping muffin brownie. Tart
                        bear claw cake tiramisu chocolate bar gummies dragée
                        lemon drops brownie.
                      </p>
                    </div>
                  </div>
                  <form
                    className="ps-product__review"
                    action="_action"
                    method="post"
                  >
                    <h4>ADD YOUR REVIEW</h4>
                    <div className="row">
                      <div className="col-lg-6 col-md-6 col-sm-6 col-xs-12 ">
                        <div className="form-group">
                          <label>
                            Name:<span>*</span>
                          </label>
                          <input
                            className="form-control"
                            type="text"
                            placeholder=""
                          />
                        </div>
                        <div className="form-group">
                          <label>
                            Email:<span>*</span>
                          </label>
                          <input
                            className="form-control"
                            type="email"
                            placeholder=""
                          />
                        </div>
                        <div className="form-group">
                          <label>
                            Your rating
                            <span />
                          </label>
                          <select className="ps-rating">
                            <option value="1">1</option>
                            <option value="1">2</option>
                            <option value="1">3</option>
                            <option value="1">4</option>
                            <option value="5">5</option>
                          </select>
                        </div>
                      </div>
                      <div className="col-lg-8 col-md-8 col-sm-6 col-xs-12 ">
                        <div className="form-group">
                          <label>Your Review:</label>
                          <textarea className="form-control" rows={6} />
                        </div>
                        <div className="form-group">
                          <button className="ps-btn ps-btn--sm">
                            Submit
                            <i className="ps-icon-next" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
                <div className="tab-pane" role="tabpanel" id="tab_03">
                  <p>
                    Add your tag <span> *</span>
                  </p>
                  <form
                    className="ps-product__tags"
                    action="_action"
                    method="post"
                  >
                    <div className="form-group">
                      <input
                        className="form-control"
                        type="text"
                        placeholder=""
                      />
                      <button className="ps-btn ps-btn--sm">Add Tags</button>
                    </div>
                  </form>
                </div>
                <div className="tab-pane" role="tabpanel" id="tab_04">
                  <div className="form-group">
                    <textarea
                      className="form-control"
                      rows={6}
                      placeholder="Enter your addition here..."
                    />
                  </div>
                  <div className="form-group">
                    <button className="ps-btn" type="button">
                      Submit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="ps-section ps-section--top-sales ps-owl-root pt-40 pb-80">
        <div className="ps-container">
          <div className="ps-section__header mb-50">
            <div className="row">
              <div className="col-lg-9 col-md-9 col-sm-12 col-xs-12 ">
                <h3 className="ps-section__title" data-mask="Related item">
                  - YOU MIGHT ALSO LIKE
                </h3>
              </div>
              <div className="col-lg-3 col-md-3 col-sm-12 col-xs-12 ">
                <div className="ps-owl-actions">
                  <a className="ps-prev" href="#">
                    <i className="ps-icon-arrow-right" />
                    Prev
                  </a>
                  <a className="ps-next" href="#">
                    Next
                    <i className="ps-icon-arrow-left" />
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="ps-section__content">
            <div
              className="ps-owl--colection owl-slider"
              data-owl-auto="true"
              data-owl-loop="true"
              data-owl-speed="5000"
              data-owl-gap="30"
              data-owl-nav="false"
              data-owl-dots="false"
              data-owl-item="4"
              data-owl-item-xs="1"
              data-owl-item-sm="2"
              data-owl-item-md="3"
              data-owl-item-lg="4"
              data-owl-duration="1000"
              data-owl-mousedrag="on"
            >
              <div className="ps-shoes--carousel">
                <div className="ps-shoe">
                  <div className="ps-shoe__thumbnail">
                    <div className="ps-badge">
                      <span>New</span>
                    </div>
                    <a className="ps-shoe__favorite" href="#">
                      <i className="ps-icon-heart" />
                    </a>
                    <img src="shop/images/shoe/1.jpg" alt="" />
                    <a
                      className="ps-shoe__overlay"
                      href="product-detail.html"
                    />
                  </div>
                  <div className="ps-shoe__content">
                    <div className="ps-shoe__variants">
                      <div className="ps-shoe__variant normal">
                        <img src="shop/images/shoe/2.jpg" alt="" />
                        <img src="shop/images/shoe/3.jpg" alt="" />
                        <img src="shop/images/shoe/4.jpg" alt="" />
                        <img src="shop/images/shoe/5.jpg" alt="" />
                      </div>
                      <select className="ps-rating ps-shoe__rating">
                        <option value="1">1</option>
                        <option value="1">2</option>
                        <option value="1">3</option>
                        <option value="1">4</option>
                        <option value="2">5</option>
                      </select>
                    </div>
                    <div className="ps-shoe__detail">
                      <a className="ps-shoe__name" href="product-detai.html">
                        Air Jordan 7 Retro
                      </a>
                      <p className="ps-shoe__categories">
                        <a href="#">Men shoes</a>,<a href="#"> Nike</a>,
                        <a href="#"> Jordan</a>
                      </p>
                      <span className="ps-shoe__price"> £ 120</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ps-shoes--carousel">
                <div className="ps-shoe">
                  <div className="ps-shoe__thumbnail">
                    <div className="ps-badge">
                      <span>New</span>
                    </div>
                    <div className="ps-badge ps-badge--sale ps-badge--2nd">
                      <span>-35%</span>
                    </div>
                    <a className="ps-shoe__favorite" href="#">
                      <i className="ps-icon-heart" />
                    </a>
                    <img src="shop/images/shoe/2.jpg" alt="" />
                    <a
                      className="ps-shoe__overlay"
                      href="product-detail.html"
                    />
                  </div>
                  <div className="ps-shoe__content">
                    <div className="ps-shoe__variants">
                      <div className="ps-shoe__variant normal">
                        <img src="shop/images/shoe/2.jpg" alt="" />
                        <img src="shop/images/shoe/3.jpg" alt="" />
                        <img src="shop/images/shoe/4.jpg" alt="" />
                        <img src="shop/images/shoe/5.jpg" alt="" />
                      </div>
                      <select className="ps-rating ps-shoe__rating">
                        <option value="1">1</option>
                        <option value="1">2</option>
                        <option value="1">3</option>
                        <option value="1">4</option>
                        <option value="2">5</option>
                      </select>
                    </div>
                    <div className="ps-shoe__detail">
                      <a className="ps-shoe__name" href="product-detai.html">
                        Air Jordan 7 Retro
                      </a>
                      <p className="ps-shoe__categories">
                        <a href="#">Men shoes</a>,<a href="#"> Nike</a>,
                        <a href="#"> Jordan</a>
                      </p>
                      <span className="ps-shoe__price">
                        <del>£220</del> £ 120
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ps-shoes--carousel">
                <div className="ps-shoe">
                  <div className="ps-shoe__thumbnail">
                    <div className="ps-badge">
                      <span>New</span>
                    </div>
                    <a className="ps-shoe__favorite" href="#">
                      <i className="ps-icon-heart" />
                    </a>
                    <img src="shop/images/shoe/3.jpg" alt="" />
                    <a
                      className="ps-shoe__overlay"
                      href="product-detail.html"
                    />
                  </div>
                  <div className="ps-shoe__content">
                    <div className="ps-shoe__variants">
                      <div className="ps-shoe__variant normal">
                        <img src="shop/images/shoe/2.jpg" alt="" />
                        <img src="shop/images/shoe/3.jpg" alt="" />
                        <img src="shop/images/shoe/4.jpg" alt="" />
                        <img src="shop/images/shoe/5.jpg" alt="" />
                      </div>
                      <select className="ps-rating ps-shoe__rating">
                        <option value="1">1</option>
                        <option value="1">2</option>
                        <option value="1">3</option>
                        <option value="1">4</option>
                        <option value="2">5</option>
                      </select>
                    </div>
                    <div className="ps-shoe__detail">
                      <a className="ps-shoe__name" href="product-detai.html">
                        Air Jordan 7 Retro
                      </a>
                      <p className="ps-shoe__categories">
                        <a href="#">Men shoes</a>,<a href="#"> Nike</a>,
                        <a href="#"> Jordan</a>
                      </p>
                      <span className="ps-shoe__price"> £ 120</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ps-shoes--carousel">
                <div className="ps-shoe">
                  <div className="ps-shoe__thumbnail">
                    <a className="ps-shoe__favorite" href="#">
                      <i className="ps-icon-heart" />
                    </a>
                    <img src="shop/images/shoe/4.jpg" alt="" />
                    <a
                      className="ps-shoe__overlay"
                      href="product-detail.html"
                    />
                  </div>
                  <div className="ps-shoe__content">
                    <div className="ps-shoe__variants">
                      <div className="ps-shoe__variant normal">
                        <img src="shop/images/shoe/2.jpg" alt="" />
                        <img src="shop/images/shoe/3.jpg" alt="" />
                        <img src="shop/images/shoe/4.jpg" alt="" />
                        <img src="shop/images/shoe/5.jpg" alt="" />
                      </div>
                      <select className="ps-rating ps-shoe__rating">
                        <option value="1">1</option>
                        <option value="1">2</option>
                        <option value="1">3</option>
                        <option value="1">4</option>
                        <option value="2">5</option>
                      </select>
                    </div>
                    <div className="ps-shoe__detail">
                      <a className="ps-shoe__name" href="product-detai.html">
                        Air Jordan 7 Retro
                      </a>
                      <p className="ps-shoe__categories">
                        <a href="#">Men shoes</a>,<a href="#"> Nike</a>,
                        <a href="#"> Jordan</a>
                      </p>
                      <span className="ps-shoe__price"> £ 120</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ps-shoes--carousel">
                <div className="ps-shoe">
                  <div className="ps-shoe__thumbnail">
                    <div className="ps-badge">
                      <span>New</span>
                    </div>
                    <a className="ps-shoe__favorite" href="#">
                      <i className="ps-icon-heart" />
                    </a>
                    <img src="shop/images/shoe/5.jpg" alt="" />
                    <a
                      className="ps-shoe__overlay"
                      href="product-detail.html"
                    />
                  </div>
                  <div className="ps-shoe__content">
                    <div className="ps-shoe__variants">
                      <div className="ps-shoe__variant normal">
                        <img src="shop/images/shoe/2.jpg" alt="" />
                        <img src="shop/images/shoe/3.jpg" alt="" />
                        <img src="shop/images/shoe/4.jpg" alt="" />
                        <img src="shop/images/shoe/5.jpg" alt="" />
                      </div>
                      <select className="ps-rating ps-shoe__rating">
                        <option value="1">1</option>
                        <option value="1">2</option>
                        <option value="1">3</option>
                        <option value="1">4</option>
                        <option value="2">5</option>
                      </select>
                    </div>
                    <div className="ps-shoe__detail">
                      <a className="ps-shoe__name" href="product-detai.html">
                        Air Jordan 7 Retro
                      </a>
                      <p className="ps-shoe__categories">
                        <a href="#">Men shoes</a>,<a href="#"> Nike</a>,
                        <a href="#"> Jordan</a>
                      </p>
                      <span className="ps-shoe__price"> £ 120</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ps-shoes--carousel">
                <div className="ps-shoe">
                  <div className="ps-shoe__thumbnail">
                    <a className="ps-shoe__favorite" href="#">
                      <i className="ps-icon-heart" />
                    </a>
                    <img src="shop/images/shoe/6.jpg" alt="" />
                    <a
                      className="ps-shoe__overlay"
                      href="product-detail.html"
                    />
                  </div>
                  <div className="ps-shoe__content">
                    <div className="ps-shoe__variants">
                      <div className="ps-shoe__variant normal">
                        <img src="shop/images/shoe/2.jpg" alt="" />
                        <img src="shop/images/shoe/3.jpg" alt="" />
                        <img src="shop/images/shoe/4.jpg" alt="" />
                        <img src="shop/images/shoe/5.jpg" alt="" />
                      </div>
                      <select className="ps-rating ps-shoe__rating">
                        <option value="1">1</option>
                        <option value="1">2</option>
                        <option value="1">3</option>
                        <option value="1">4</option>
                        <option value="2">5</option>
                      </select>
                    </div>
                    <div className="ps-shoe__detail">
                      <a className="ps-shoe__name" href="product-detai.html">
                        Air Jordan 7 Retro
                      </a>
                      <p className="ps-shoe__categories">
                        <a href="#">Men shoes</a>,<a href="#"> Nike</a>,
                        <a href="#"> Jordan</a>
                      </p>
                      <span className="ps-shoe__price"> £ 120</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Detail;
