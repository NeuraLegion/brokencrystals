import React, { FC } from 'react';
import { Testimonial } from '../../../interfaces/Testimonial';

interface Props {
  testimonials: Array<Testimonial>;
}

export const TestimonialsItems: FC<Props> = (props: Props) => {
  const { testimonials } = props;
  return (
    <>
      {testimonials.map((item, index) => (
        <div className="testimonial-item" key={item.name + index}>
          <p>
            <i className="bx bxs-quote-alt-left quote-icon-left" />
            <span dangerouslySetInnerHTML={{ __html: item.message }} />
            <i className="bx bxs-quote-alt-right quote-icon-right" />
          </p>
          <img
            src="assets/img/testimonials/testimonials-1.jpg"
            className="testimonial-img"
            alt=""
          />
          <h3 dangerouslySetInnerHTML={{ __html: item.name }} />
          <h4 dangerouslySetInnerHTML={{ __html: item.title }} />
        </div>
      ))}
    </>
  );
};

export default TestimonialsItems;
