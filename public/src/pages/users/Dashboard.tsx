import React, { FC } from 'react';

export const Dashboard: FC = () => {
  return (
    <>
      <section className="au-breadcrumb2">
        <div className="container">
          <div className="row">
            <div className="col-md-12">
              <div className="au-breadcrumb-content">
                <div className="au-breadcrumb-left">
                  <span className="au-breadcrumb-span">You are here:</span>
                  <ul className="list-unstyled list-inline au-breadcrumb__list">
                    <li className="list-inline-item active">
                      <a href="#">Home</a>
                    </li>
                    <li className="list-inline-item seprate">
                      <span>/</span>
                    </li>
                    <li className="list-inline-item">Dashboard</li>
                  </ul>
                </div>
                <form className="au-form-icon--sm" action="" method="post">
                  <input
                    className="au-input--w300 au-input--style2"
                    type="text"
                    placeholder="Search for datas &amp; reports..."
                  />
                  <button className="au-btn--submit2" type="submit">
                    <i className="zmdi zmdi-search" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="welcome p-t-10">
        <div className="container">
          <div className="row">
            <div className="col-md-12">
              <h1 className="title-4">
                Welcome back
                <span>John!</span>
              </h1>
              <hr className="line-seprate" />
            </div>
          </div>
        </div>
      </section>

      <section className="statistic statistic2">
        <div className="container">
          <div className="row">
            <div className="col-md-6 col-lg-3">
              <div className="statistic__item statistic__item--green">
                <h2 className="number">10,368</h2>
                <span className="desc">members online</span>
                <div className="icon">
                  <i className="zmdi zmdi-account-o" />
                </div>
              </div>
            </div>
            <div className="col-md-6 col-lg-3">
              <div className="statistic__item statistic__item--orange">
                <h2 className="number">388,688</h2>
                <span className="desc">items sold</span>
                <div className="icon">
                  <i className="zmdi zmdi-shopping-cart" />
                </div>
              </div>
            </div>
            <div className="col-md-6 col-lg-3">
              <div className="statistic__item statistic__item--blue">
                <h2 className="number">1,086</h2>
                <span className="desc">this week</span>
                <div className="icon">
                  <i className="zmdi zmdi-calendar-note" />
                </div>
              </div>
            </div>
            <div className="col-md-6 col-lg-3">
              <div className="statistic__item statistic__item--red">
                <h2 className="number">$1,060,386</h2>
                <span className="desc">total earnings</span>
                <div className="icon">
                  <i className="zmdi zmdi-money" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="statistic-chart">
        <div className="container">
          <div className="row">
            <div className="col-md-12">
              <h3 className="title-5 m-b-35">statistics</h3>
            </div>
          </div>
          <div className="row">
            <div className="col-md-6 col-lg-4">
              <div className="statistic-chart-1">
                <h3 className="title-3 m-b-30">chart</h3>
                <div className="chart-wrap">
                  <canvas id="widgetChart5" />
                </div>
                <div className="statistic-chart-1-note">
                  <span className="big">10,368</span>
                  <span>/ 16220 items sold</span>
                </div>
              </div>
            </div>
            <div className="col-md-6 col-lg-4">
              <div className="top-campaign">
                <h3 className="title-3 m-b-30">top campaigns</h3>
                <div className="table-responsive">
                  <table className="table table-top-campaign">
                    <tbody>
                      <tr>
                        <td>1. Australia</td>
                        <td>$70,261.65</td>
                      </tr>
                      <tr>
                        <td>2. United Kingdom</td>
                        <td>$46,399.22</td>
                      </tr>
                      <tr>
                        <td>3. Turkey</td>
                        <td>$35,364.90</td>
                      </tr>
                      <tr>
                        <td>4. Germany</td>
                        <td>$20,366.96</td>
                      </tr>
                      <tr>
                        <td>5. France</td>
                        <td>$10,366.96</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-md-6 col-lg-4">
              <div className="chart-percent-2">
                <h3 className="title-3 m-b-30">chart by %</h3>
                <div className="chart-wrap">
                  <canvas id="percent-chart2" />
                  <div id="chartjs-tooltip">
                    <table />
                  </div>
                </div>
                <div className="chart-info">
                  <div className="chart-note">
                    <span className="dot dot--blue" />
                    <span>products</span>
                  </div>
                  <div className="chart-note">
                    <span className="dot dot--red" />
                    <span>Services</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="p-t-20">
        <div className="container">
          <div className="row">
            <div className="col-md-12">
              <h3 className="title-5 m-b-35">data table</h3>
              <div className="table-data__tool">
                <div className="table-data__tool-left">
                  <div className="rs-select2--light rs-select2--md">
                    <select className="js-select2" name="property">
                      <option selected={true}>All Properties</option>
                      <option value="">Option 1</option>
                      <option value="">Option 2</option>
                    </select>
                    <div className="dropDownSelect2" />
                  </div>
                  <div className="rs-select2--light rs-select2--sm">
                    <select className="js-select2" name="time">
                      <option selected={true}>Today</option>
                      <option value="">3 Days</option>
                      <option value="">1 Week</option>
                    </select>
                    <div className="dropDownSelect2" />
                  </div>
                  <button className="au-btn-filter">
                    <i className="zmdi zmdi-filter-list" />
                    filters
                  </button>
                </div>
                <div className="table-data__tool-right">
                  <button className="au-btn au-btn-icon au-btn--green au-btn--small">
                    <i className="zmdi zmdi-plus" />
                    add item
                  </button>
                  <div className="rs-select2--dark rs-select2--sm rs-select2--dark2">
                    <select className="js-select2" name="type">
                      <option selected={true}>Export</option>
                      <option value="">Option 1</option>
                      <option value="">Option 2</option>
                    </select>
                    <div className="dropDownSelect2" />
                  </div>
                </div>
              </div>
              <div className="table-responsive table-responsive-data2">
                <table className="table table-data2">
                  <thead>
                    <tr>
                      <th>
                        <label className="au-checkbox">
                          <input type="checkbox" />
                          <span className="au-checkmark" />
                        </label>
                      </th>
                      <th>name</th>
                      <th>email</th>
                      <th>description</th>
                      <th>date</th>
                      <th>status</th>
                      <th>price</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="tr-shadow">
                      <td>
                        <label className="au-checkbox">
                          <input type="checkbox" />
                          <span className="au-checkmark" />
                        </label>
                      </td>
                      <td>Lori Lynch</td>
                      <td>
                        <span className="block-email">lori@example.com</span>
                      </td>
                      <td className="desc">Samsung S8 Black</td>
                      <td>2018-09-27 02:12</td>
                      <td>
                        <span className="status--process">Processed</span>
                      </td>
                      <td>$679.00</td>
                      <td>
                        <div className="table-data-feature">
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Send"
                          >
                            <i className="zmdi zmdi-mail-send" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Edit"
                          >
                            <i className="zmdi zmdi-edit" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Delete"
                          >
                            <i className="zmdi zmdi-delete" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="More"
                          >
                            <i className="zmdi zmdi-more" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr className="spacer" />
                    <tr className="tr-shadow">
                      <td>
                        <label className="au-checkbox">
                          <input type="checkbox" />
                          <span className="au-checkmark" />
                        </label>
                      </td>
                      <td>Lori Lynch</td>
                      <td>
                        <span className="block-email">john@example.com</span>
                      </td>
                      <td className="desc">iPhone X 64Gb Grey</td>
                      <td>2018-09-29 05:57</td>
                      <td>
                        <span className="status--process">Processed</span>
                      </td>
                      <td>$999.00</td>
                      <td>
                        <div className="table-data-feature">
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Send"
                          >
                            <i className="zmdi zmdi-mail-send" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Edit"
                          >
                            <i className="zmdi zmdi-edit" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Delete"
                          >
                            <i className="zmdi zmdi-delete" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="More"
                          >
                            <i className="zmdi zmdi-more" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr className="spacer" />
                    <tr className="tr-shadow">
                      <td>
                        <label className="au-checkbox">
                          <input type="checkbox" />
                          <span className="au-checkmark" />
                        </label>
                      </td>
                      <td>Lori Lynch</td>
                      <td>
                        <span className="block-email">lyn@example.com</span>
                      </td>
                      <td className="desc">iPhone X 256Gb Black</td>
                      <td>2018-09-25 19:03</td>
                      <td>
                        <span className="status--denied">Denied</span>
                      </td>
                      <td>$1199.00</td>
                      <td>
                        <div className="table-data-feature">
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Send"
                          >
                            <i className="zmdi zmdi-mail-send" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Edit"
                          >
                            <i className="zmdi zmdi-edit" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Delete"
                          >
                            <i className="zmdi zmdi-delete" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="More"
                          >
                            <i className="zmdi zmdi-more" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr className="spacer" />
                    <tr className="tr-shadow">
                      <td>
                        <label className="au-checkbox">
                          <input type="checkbox" />
                          <span className="au-checkmark" />
                        </label>
                      </td>
                      <td>Lori Lynch</td>
                      <td>
                        <span className="block-email">doe@example.com</span>
                      </td>
                      <td className="desc">Camera C430W 4k</td>
                      <td>2018-09-24 19:10</td>
                      <td>
                        <span className="status--process">Processed</span>
                      </td>
                      <td>$699.00</td>
                      <td>
                        <div className="table-data-feature">
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Send"
                          >
                            <i className="zmdi zmdi-mail-send" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Edit"
                          >
                            <i className="zmdi zmdi-edit" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="Delete"
                          >
                            <i className="zmdi zmdi-delete" />
                          </button>
                          <button
                            className="item"
                            data-toggle="tooltip"
                            data-placement="top"
                            title="More"
                          >
                            <i className="zmdi zmdi-more" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="p-t-60 p-b-20">
        <div className="container">
          <div className="row">
            <div className="col-md-12">
              <div className="copyright">
                <p>
                  Copyright © 2018 Colorlib. All rights reserved. Template by{' '}
                  <a href="https://colorlib.com">Colorlib</a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Dashboard;
