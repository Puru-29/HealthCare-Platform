import { createDraftHospitalsFromReviewSchema, hospitalSourceReviewDecisionSchema, } from '../middleware/hospital-source-review-validation.js';
import { pageQuerySchema } from '../middleware/admin-validation.js';
import { createDraftHospitalsFromReviewedPair, listUnlinkedSourceObservations, recordSourceObservationReviewDecision, } from '../services/hospital-source-review.service.js';
function actor(response) {
    return response.locals.admin.username;
}
export const getUnlinkedSourceObservations = async (request, response) => {
    const query = pageQuerySchema.parse(request.query);
    response.status(200).json(await listUnlinkedSourceObservations(query.limit, query.offset));
};
export const recordHospitalSourceReviewDecision = async (request, response) => {
    const parsed = hospitalSourceReviewDecisionSchema.safeParse(request.body);
    if (!parsed.success)
        throw parsed.error;
    const decision = await recordSourceObservationReviewDecision(parsed.data, actor(response));
    response.status(201).json({ data: decision });
};
export const createDraftHospitalsFromSourceReview = async (request, response) => {
    const parsed = createDraftHospitalsFromReviewSchema.safeParse(request.body);
    if (!parsed.success)
        throw parsed.error;
    const result = await createDraftHospitalsFromReviewedPair(parsed.data.reviewId, actor(response));
    response.status(result.alreadyCreated ? 200 : 201).json({ data: result });
};
