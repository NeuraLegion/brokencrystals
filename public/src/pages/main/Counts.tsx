import React, { FC } from 'react';

export const Counts: FC = () => {
  const counters = [
    { name: 'Crystals', value: 154 },
    { name: 'Gemstones', value: 78 },
    { name: 'Jewellery', value: 23 },
    { name: 'Massage', value: 9 }
  ];

  return (
    <section id="counts" className="counts">
      <div className="container">
        <div className="row counters">
          {counters.map((counter, idx) => (
            <div className="col-lg-3 col-6 text-center" key={`counter-${idx}`}>
              <span data-toggle="counter-up">{counter.value}</span>
              <p>{counter.name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Counts;
