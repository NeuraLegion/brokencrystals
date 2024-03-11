import React, {
  Dispatch,
  FC,
  FormEvent,
  SetStateAction,
  useState
} from 'react';
import { postTestimonials } from '../../../api/httpClient';
import { Testimonial } from '../../../interfaces/Testimonial';

const defaultTestimonial: Testimonial = {
  name: '',
  title: '',
  message: ''
};

interface Props {
  setNewTestimonial: Dispatch<SetStateAction<Testimonial>>;
}

export const TestimonialsForm: FC<Props> = (props: Props) => {
  const user = sessionStorage.getItem('email') || localStorage.getItem('email');

  const [form, setForm] = useState<Testimonial>(defaultTestimonial);
  const { name, title, message } = form;

  const { setNewTestimonial } = props;

  const sendTestimonial = (e: FormEvent) => {
    e.preventDefault();

    postTestimonials(form).then(() => {
      setNewTestimonial && setNewTestimonial(form);
      setForm(defaultTestimonial);
    });
  };

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  return (
    <>
      {user && (
        <div className="container mt-5" data-aos="fade-up">
          <form role="form" onSubmit={sendTestimonial}>
            <div className="form-row">
              <div className="col-md-6 form-group">
                <input
                  type="text"
                  name="name"
                  className="form-control"
                  id="name"
                  placeholder="Your Name"
                  data-rule="minlen:4"
                  data-msg="Please enter at least 4 chars"
                  value={name}
                  onInput={onInput}
                />
                <div className="validate" />
              </div>

              <div className="col-md-6 form-group">
                <input
                  type="text"
                  className="form-control"
                  name="title"
                  id="job-title"
                  placeholder="Your Title"
                  data-rule="minlen:4"
                  data-msg="Please enter at least 4 chars"
                  value={title}
                  onInput={onInput}
                />
                <div className="validate" />
              </div>
            </div>

            <div className="form-group">
              <textarea
                className="form-control"
                name="message"
                rows={5}
                data-rule="required"
                data-msg="Please write something for us"
                placeholder="Testimonial"
                value={message}
                onChange={onInput}
              />
              <div className="validate" />
            </div>

            <div className="text-center">
              <button className="submit-testimonial" type="submit">
                Send Testimonial
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default TestimonialsForm;
