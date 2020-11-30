import React, { FC, useEffect, useRef, useState } from "react";
import logo from "../img/logo.png";
import heroImg from "../img/hero-img.png";

export const Main: FC = () => {
  const [user] = useState({ username: undefined });
  const [search] = useState();

  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { current } = headerRef;

    const handleScroll = () => {
      if (current) {
        if (window.pageYOffset > 100) {
          current.classList.add("header-scrolled");
          current.classList.remove("navbar-margin");
        } else {
          current.classList.remove("header-scrolled");
          current.classList.add("navbar-margin");
        }
      }
    };

    document.addEventListener("scroll", handleScroll);

    return () => {
      document.removeEventListener("scroll", handleScroll);
    };
  });

  return (
    <>
      <header>
        <nav
          ref={headerRef}
          className="navbar fixed-top navbar-expand-lg navbar-dark bg-faded navbar-margin"
        >
          <div className="navbar-header">
            <a className="navbar-brand" href="/">
              <img src={logo} width="50" height="50" alt="" loading="lazy" />
              BROKEN CRYSTALS
            </a>
          </div>
          <button
            className="navbar-toggler"
            type="button"
            data-toggle="collapse"
            data-target="#navbarSupportedContent"
            aria-controls="navbarSupportedContent"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="navbarSupportedContent">
            <ul className="navbar-nav ml-auto mr-auto">
              <li className="nav-item active">
                <a className="nav-link" href="#">
                  Home <span className="sr-only">(current)</span>
                </a>
              </li>
              <li className="nav-item">
                <a className="nav-link scrollto" href="#footer">
                  Marketplace
                </a>
              </li>
              <li className="nav-item dropdown">
                <a
                  className="nav-link dropdown-toggle"
                  href="#"
                  id="navbarDropdown"
                  role="button"
                  data-toggle="dropdown"
                  aria-haspopup="true"
                  aria-expanded="false"
                >
                  Gemstones
                </a>
                <div className="dropdown-menu" aria-labelledby="navbarDropdown">
                  <a className="dropdown-item" href="#">
                    Action
                  </a>
                  <a className="dropdown-item" href="#">
                    Another action
                  </a>
                  <div className="dropdown-divider" />
                  <a className="dropdown-item" href="#">
                    Something else here
                  </a>
                </div>
              </li>
              <li className="nav-item dropdown">
                <a
                  className="nav-link dropdown-toggle"
                  href="#"
                  id="navbarDropdown"
                  role="button"
                  data-toggle="dropdown"
                  aria-haspopup="true"
                  aria-expanded="false"
                >
                  Healing
                </a>
                <div className="dropdown-menu" aria-labelledby="navbarDropdown">
                  <a className="dropdown-item" href="#">
                    Action
                  </a>
                  <a className="dropdown-item" href="#">
                    Another action
                  </a>
                  <div className="dropdown-divider" />
                  <a className="dropdown-item" href="#">
                    Something else here
                  </a>
                </div>
              </li>
              <li className="nav-item dropdown">
                <a
                  className="nav-link dropdown-toggle"
                  href="#"
                  id="navbarDropdown"
                  role="button"
                  data-toggle="dropdown"
                  aria-haspopup="true"
                  aria-expanded="false"
                >
                  Jewellery
                </a>
                <div className="dropdown-menu" aria-labelledby="navbarDropdown">
                  <a className="dropdown-item" href="#">
                    Action
                  </a>
                  <a className="dropdown-item" href="#">
                    Another action
                  </a>
                  <div className="dropdown-divider" />
                  <a className="dropdown-item" href="#">
                    Something else here
                  </a>
                </div>
              </li>
            </ul>
            <form className="form-inline my-2 my-lg-0" method="get">
              <input
                className="form-control mr-sm-2"
                type="search"
                name="search"
                placeholder="Search"
                aria-label="Search"
              />
              <button
                className="btn btn-outline-light my-2 my-sm-0"
                type="submit"
              >
                Search
              </button>
            </form>
            <ul className="navbar-nav ml-auto">
              {user && user.username ? (
                <button
                  onClick={() => (window.location.href = "/logout")}
                  className="btn btn-outline-light my-2 my-sm-0"
                  type="button"
                >
                  Log out {user.username}
                </button>
              ) : (
                <button
                  onClick={() => (window.location.href = "/login")}
                  className="btn btn-outline-light my-2 my-sm-0"
                  type="button"
                >
                  Sign in
                </button>
              )}
            </ul>
          </div>
        </nav>
      </header>

      <section id="hero" className="d-flex align-items-center">
        <div className="container-fluid" data-aos="fade-up">
          <div className="row justify-content-center">
            <div className="col-xl-5 col-lg-6 pt-3 pt-lg-0 order-2 order-lg-1 d-flex flex-column justify-content-center">
              {search ? (
                <>
                  <h1>You searched for: {search}</h1>
                  <h2>143 records found</h2>
                  <div>
                    <a href="#results" className="btn-get-started scrollto">
                      See results
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <h1>Your Vulnerable Crystal Marketplace</h1>
                  <h2>All the beautiful stones in one place</h2>
                  <div>
                    <a href="#marketplace" className="btn-get-started scrollto">
                      Get Started
                    </a>
                  </div>
                </>
              )}
            </div>
            <div
              className="col-xl-4 col-lg-6 order-1 order-lg-2 hero-img"
              data-aos="zoom-in"
              data-aos-delay="150"
            >
              <a href="/photo?image=logo.png">
                <img src={heroImg} className="img-fluid animated" alt="" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer id="footer">
        <div className="footer-top">
          <div className="container">
            <div className="row">
              <div className="col-lg-3 col-md-6 footer-contact">
                <a href="/" className="logo mr-auto">
                  <img
                    width={100}
                    height={100}
                    src={logo}
                    alt=""
                    className="img-fluid"
                  />
                </a>
                <h3>
                  BROKEN <br />
                  CRYSTALS
                </h3>
              </div>
              <div className="col-lg-3 col-md-6 footer-contact">
                <h4>Contact</h4>
                <p>
                  308 Negra Arroyo Lane <br />
                  Albuquerque, New Mexico <br />
                  United States <br />
                  <br />
                  <strong>Phone:</strong> +1 5589 55488 55
                  <br />
                  <strong>Email:</strong> info@example.com
                  <br />
                </p>
              </div>

              <div className="col-lg-3 col-md-6 footer-links">
                <h4>Links</h4>
                <ul>
                  <li>
                    <a href="#">Marketplace</a>
                  </li>
                  <li>
                    <a href="#">Gemstones</a>
                  </li>
                  <li>
                    <a href="#">Healing</a>
                  </li>
                  <li>
                    <a href="#">Jewellery</a>
                  </li>
                </ul>
              </div>

              <div className="col-lg-3 col-md-6 footer-newsletter">
                <h4>Join Our Newsletter</h4>
                <p>Receive updates from our shiny world</p>
                <form method="post">
                  <input type="email" name="email" />
                  <input type="submit" value="Subscribe" />
                </form>
              </div>
            </div>
          </div>
        </div>

        <div className="container">
          <div className="copyright-wrap d-md-flex py-4">
            <div className="mr-md-auto text-center text-md-left">
              <div className="copyright">
                &copy; Copyright{" "}
                <strong>
                  <span>Broken Crystals</span>
                </strong>
                . All Rights Reserved
              </div>
            </div>
            <div className="social-links text-center text-md-right pt-3 pt-md-0">
              <a href="#" className="twitter" />
              <a href="#" className="facebook" />
              <a href="#" className="instagram" />
              <a href="#" className="linkedin" />
            </div>
          </div>
        </div>
      </footer>
    </>
  );
};

export default Main;
