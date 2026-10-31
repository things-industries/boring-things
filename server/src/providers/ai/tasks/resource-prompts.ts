/** Category document priorities for resource research and document applicability. */

// Builds task instructions from the supplied application context.
export function categoryResearchPrompt(categoryId: string): string {
  const byCategory: Record<string, string> = {
    appliances: 'Find the user manual / operating instructions for the appliance.',
    devices: 'Find the user manual and support documentation for the device.',
    vehicles: "Find the owner's manual for the vehicle and its relevant variant.",
    insurance:
      'Find the policy document matching the provider, product, region and policy version.',
    memberships: 'Find the membership terms and benefits for the provider and membership type.',
    subscriptions: 'Find the subscription terms and features for the service and plan.',
    utilities: 'Find the service or tariff documentation matching the provider and product.',
  };
  return byCategory[categoryId] ?? 'Find supporting reference documents relevant to the Thing.';
}
