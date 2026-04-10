import type { FC } from 'react';
import type { Testimonial } from '../../../interfaces/Testimonial';

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
            <span className="dangerous-html">{item.message || 'N/A'}</span>
            <i className="bx bxs-quote-alt-right quote-icon-right" />
          </p>
          <img
            src="assets/img/testimonials/testimonials-1.jpg"
            className="testimonial-img"
            alt=""
          />
          <h3 className="dangerous-html">{item.name || 'N/A'}</h3>
          <h4 className="dangerous-html">{item.title || 'N/A'}</h4>
        </div>
      ))}
    </>
  );
};

export default TestimonialsItems;
