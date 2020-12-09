import React, { FC } from 'react';

export const Listing: FC = () => {
  return (
    <>
      <div className="ps-products-wrap pt-80 pb-80">
        <div className="ps-products" data-mh="product-listing">
          <div className="ps-product-action">
            <div className="ps-product__filter">
              <select className="ps-select selectpicker">
                <option value="1">Shortby</option>
                <option value="2">Name</option>
                <option value="3">Price (Low to High)</option>
                <option value="3">Price (High to Low)</option>
              </select>
            </div>
            <div className="ps-pagination">
              <ul className="pagination">
                <li>
                  <a href="#">
                    <i className="fa fa-angle-left" />
                  </a>
                </li>
                <li className="active">
                  <a href="#">1</a>
                </li>
                <li>
                  <a href="#">2</a>
                </li>
                <li>
                  <a href="#">3</a>
                </li>
                <li>
                  <a href="#">...</a>
                </li>
                <li>
                  <a href="#">
                    <i className="fa fa-angle-right" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="ps-product__columns">
            <div className="ps-product__column">
              <div className="ps-shoe mb-30">
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
                  <img src="assets/img/crystals/amethyst.jpg" alt="" />
                  <a className="ps-shoe__overlay" href="product-detail.html" />
                </div>
                <div className="ps-shoe__content">
                  <div className="ps-shoe__variants">
                    <div className="ps-shoe__variant normal">
                      <img src="assets/img/crystals/amethyst.jpg" alt="" />
                      <img src="assets/img/crystals/amethyst.jpg" alt="" />
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
                    <a className="ps-shoe__name" href="#">
                      Amethyst
                    </a>
                    <p className="ps-shoe__categories">
                      <a href="#">Healing</a>
                    </p>
                    <span className="ps-shoe__price">
                      <del>£220</del> £ 120
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="ps-product__column">
              <div className="ps-shoe mb-30">
                <div className="ps-shoe__thumbnail">
                  <a className="ps-shoe__favorite" href="#">
                    <i className="ps-icon-heart" />
                  </a>
                  <img src="shop/images/shoe/2.jpg" alt="" />
                  <a className="ps-shoe__overlay" href="product-detail.html" />
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
                    <a className="ps-shoe__name" href="#">
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
            <div className="ps-product__column">
              <div className="ps-shoe mb-30">
                <div className="ps-shoe__thumbnail">
                  <a className="ps-shoe__favorite" href="#">
                    <i className="ps-icon-heart" />
                  </a>
                  <img src="shop/images/shoe/3.jpg" alt="" />
                  <a className="ps-shoe__overlay" href="product-detail.html" />
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
                    <a className="ps-shoe__name" href="#">
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
            <div className="ps-product__column">
              <div className="ps-shoe mb-30">
                <div className="ps-shoe__thumbnail">
                  <div className="ps-badge ps-badge--sale">
                    <span>-35%</span>
                  </div>
                  <a className="ps-shoe__favorite" href="#">
                    <i className="ps-icon-heart" />
                  </a>
                  <img src="shop/images/shoe/4.jpg" alt="" />
                  <a className="ps-shoe__overlay" href="product-detail.html" />
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
                    <a className="ps-shoe__name" href="#">
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
            <div className="ps-product__column">
              <div className="ps-shoe mb-30">
                <div className="ps-shoe__thumbnail">
                  <a className="ps-shoe__favorite" href="#">
                    <i className="ps-icon-heart" />
                  </a>
                  <img src="shop/images/shoe/5.jpg" alt="" />
                  <a className="ps-shoe__overlay" href="product-detail.html" />
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
                    <a className="ps-shoe__name" href="#">
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
            {/*<div className="ps-product__column">*/}
            {/*<div className="ps-shoe mb-30">*/}
            {/*  <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/6.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*  </div>*/}
            {/*  <div className="ps-shoe__content">*/}
            {/*    <div className="ps-shoe__variants">*/}
            {/*      <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*      <select className="ps-rating ps-shoe__rating">*/}
            {/*        <option value="1">1</option>*/}
            {/*        <option value="1">2</option>*/}
            {/*        <option value="1">3</option>*/}
            {/*        <option value="1">4</option>*/}
            {/*        <option value="2">5</option>*/}
            {/*      </select>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*      <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/7.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/8.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/9.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/10.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail">*/}
            {/*      <div className="ps-badge"><span>New</span></div>*/}
            {/*      <div className="ps-badge ps-badge--sale ps-badge--2nd"><span>-35%</span></div><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/1.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price">*/}
            {/*              <del>£220</del> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/2.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/3.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail">*/}
            {/*      <div className="ps-badge ps-badge--sale"><span>-35%</span></div><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/4.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price">*/}
            {/*              <del>£220</del> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/5.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/6.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/7.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/8.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"/>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/9.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/10.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail">*/}
            {/*      <div className="ps-badge"><span>New</span></div>*/}
            {/*      <div className="ps-badge ps-badge--sale ps-badge--2nd"><span>-35%</span></div><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/1.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price">*/}
            {/*              <del>£220</del> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/2.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/3.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail">*/}
            {/*      <div className="ps-badge ps-badge--sale"><span>-35%</span></div><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/4.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price">*/}
            {/*              <del>£220</del> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/5.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/6.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/7.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/8.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/9.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
            {/*<div className="ps-product__column">*/}
            {/*  <div className="ps-shoe mb-30">*/}
            {/*    <div className="ps-shoe__thumbnail"><a className="ps-shoe__favorite" href="#"><i className="ps-icon-heart"/></a><img src="shop/images/shoe/10.jpg" alt=""/><a className="ps-shoe__overlay" href="product-detail.html"></a>*/}
            {/*    </div>*/}
            {/*    <div className="ps-shoe__content">*/}
            {/*      <div className="ps-shoe__variants">*/}
            {/*        <div className="ps-shoe__variant normal"><img src="shop/images/shoe/2.jpg" alt=""/><img src="shop/images/shoe/3.jpg" alt=""/><img src="shop/images/shoe/4.jpg" alt=""/><img src="shop/images/shoe/5.jpg" alt=""/></div>*/}
            {/*        <select className="ps-rating ps-shoe__rating">*/}
            {/*          <option value="1">1</option>*/}
            {/*          <option value="1">2</option>*/}
            {/*          <option value="1">3</option>*/}
            {/*          <option value="1">4</option>*/}
            {/*          <option value="2">5</option>*/}
            {/*        </select>*/}
            {/*      </div>*/}
            {/*      <div className="ps-shoe__detail"><a className="ps-shoe__name" href="#">Air Jordan 7 Retro</a>*/}
            {/*        <p className="ps-shoe__categories"><a href="#">Men shoes</a>,<a href="#"> Nike</a>,<a href="#"> Jordan</a></p><span className="ps-shoe__price"> £ 120</span>*/}
            {/*      </div>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}
          </div>
          <div className="ps-product-action">
            <div className="ps-product__filter">
              <select className="ps-select selectpicker">
                <option value="1">Shortby</option>
                <option value="2">Name</option>
                <option value="3">Price (Low to High)</option>
                <option value="3">Price (High to Low)</option>
              </select>
            </div>
            <div className="ps-pagination">
              <ul className="pagination">
                <li>
                  <a href="#">
                    <i className="fa fa-angle-left" />
                  </a>
                </li>
                <li className="active">
                  <a href="#">1</a>
                </li>
                <li>
                  <a href="#">2</a>
                </li>
                <li>
                  <a href="#">3</a>
                </li>
                <li>
                  <a href="#">...</a>
                </li>
                <li>
                  <a href="#">
                    <i className="fa fa-angle-right" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="ps-sidebar" data-mh="product-listing">
          <aside className="ps-widget--sidebar ps-widget--category">
            <div className="ps-widget__header">
              <h3>Category</h3>
            </div>
            <div className="ps-widget__content">
              <ul className="ps-list--checked">
                <li className="current">
                  <a href="product-listing.html">Life(521)</a>
                </li>
                <li>
                  <a href="product-listing.html">Running(76)</a>
                </li>
                <li>
                  <a href="product-listing.html">Baseball(21)</a>
                </li>
                <li>
                  <a href="product-listing.html">Football(105)</a>
                </li>
                <li>
                  <a href="product-listing.html">Soccer(108)</a>
                </li>
                <li>
                  <a href="product-listing.html">Trainning & game(47)</a>
                </li>
                <li>
                  <a href="product-listing.html">More</a>
                </li>
              </ul>
            </div>
          </aside>
          <aside className="ps-widget--sidebar ps-widget--filter">
            <div className="ps-widget__header">
              <h3>Category</h3>
            </div>
            <div className="ps-widget__content">
              <div
                className="ac-slider"
                data-default-min="300"
                data-default-max="2000"
                data-max="3450"
                data-step="50"
                data-unit="$"
              ></div>
              <p className="ac-slider__meta">
                Price:<span className="ac-slider__value ac-slider__min"></span>-
                <span className="ac-slider__value ac-slider__max"></span>
              </p>
              <a className="ac-slider__filter ps-btn" href="#">
                Filter
              </a>
            </div>
          </aside>
          <aside className="ps-widget--sidebar ps-widget--category">
            <div className="ps-widget__header">
              <h3>Sky Brand</h3>
            </div>
            <div className="ps-widget__content">
              <ul className="ps-list--checked">
                <li className="current">
                  <a href="product-listing.html">Nike(521)</a>
                </li>
                <li>
                  <a href="product-listing.html">Adidas(76)</a>
                </li>
                <li>
                  <a href="product-listing.html">Baseball(69)</a>
                </li>
                <li>
                  <a href="product-listing.html">Gucci(36)</a>
                </li>
                <li>
                  <a href="product-listing.html">Dior(108)</a>
                </li>
                <li>
                  <a href="product-listing.html">B&G(108)</a>
                </li>
                <li>
                  <a href="product-listing.html">Louis Vuiton(47)</a>
                </li>
              </ul>
            </div>
          </aside>
          <aside className="ps-widget--sidebar ps-widget--category">
            <div className="ps-widget__header">
              <h3>Width</h3>
            </div>
            <div className="ps-widget__content">
              <ul className="ps-list--checked">
                <li className="current">
                  <a href="product-listing.html">Narrow</a>
                </li>
                <li>
                  <a href="product-listing.html">Regular</a>
                </li>
                <li>
                  <a href="product-listing.html">Wide</a>
                </li>
                <li>
                  <a href="product-listing.html">Extra Wide</a>
                </li>
              </ul>
            </div>
          </aside>
          <div className="ps-sticky desktop">
            <aside className="ps-widget--sidebar">
              <div className="ps-widget__header">
                <h3>Size</h3>
              </div>
              <div className="ps-widget__content">
                <table className="table ps-table--size">
                  <tbody>
                    <tr>
                      <td className="active">3</td>
                      <td>5.5</td>
                      <td>8</td>
                      <td>10.5</td>
                      <td>13</td>
                    </tr>
                    <tr>
                      <td>3.5</td>
                      <td>6</td>
                      <td>8.5</td>
                      <td>11</td>
                      <td>13.5</td>
                    </tr>
                    <tr>
                      <td>4</td>
                      <td>6.5</td>
                      <td>9</td>
                      <td>11.5</td>
                      <td>14</td>
                    </tr>
                    <tr>
                      <td>4.5</td>
                      <td>7</td>
                      <td>9.5</td>
                      <td>12</td>
                      <td>14.5</td>
                    </tr>
                    <tr>
                      <td>5</td>
                      <td>7.5</td>
                      <td>10</td>
                      <td>12.5</td>
                      <td>15</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </aside>
            <aside className="ps-widget--sidebar">
              <div className="ps-widget__header">
                <h3>Color</h3>
              </div>
              <div className="ps-widget__content">
                <ul className="ps-list--color">
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                  <li>
                    <a href="#"></a>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
};

export default Listing;
