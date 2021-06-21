import React, { FC } from 'react';

export const Hero: FC = () => {
  return (
    <section id="hero" className="d-flex align-items-center">
      <div className="container-fluid" data-aos="fade-up">
        <div className="row justify-content-center">
          <div className="col-xl-5 col-lg-6 pt-3 pt-lg-0 order-2 order-lg-1 d-flex flex-column justify-content-center">
            <h1>Your Vulnerable Crystal Marketplace</h1>
            <h2>Find the most beautiful stones in one place!</h2>
            <div>
              <a
                href="#marketplacePreview"
                className="btn-get-started scrollto"
              >
                Get Started
              </a>
            </div>
          </div>
          <div
            className="col-xl-4 col-lg-6 order-1 order-lg-2 hero-img"
            data-aos="zoom-in"
            data-aos-delay="150"
          >
            <img
              src="assets/img/hero-img.png"
              className="img-fluid animated"
              alt=""
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
