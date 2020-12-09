import React, { FC } from 'react';

export const Counts: FC = () => {
  return (
    <section id="counts" className="counts">
      <div className="container">
        <div className="row counters">
          <div className="col-lg-3 col-6 text-center">
            <span data-toggle="counter-up">154</span>
            <p>Crystals</p>
          </div>

          <div className="col-lg-3 col-6 text-center">
            <span data-toggle="counter-up">78</span>
            <p>Gemstones</p>
          </div>

          <div className="col-lg-3 col-6 text-center">
            <span data-toggle="counter-up">23</span>
            <p>Jewellery</p>
          </div>

          <div className="col-lg-3 col-6 text-center">
            <span data-toggle="counter-up">9</span>
            <p>Massage</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Counts;
