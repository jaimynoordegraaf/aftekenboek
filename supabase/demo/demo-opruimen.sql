-- aftekenboek — de demogroep voor de screenshots weer weghalen
--
-- Haalt de groep "Scouting De Waterlanders" weg, met de verzonnen mensen die
-- erin zaten. Jouw eigen account blijft, net als je echte groep.

delete from profiles p
using memberships m, groups g
where m.profile_id = p.id and m.group_id = g.id and g.slug = 'demo-screenshots'
  and not exists (select 1 from auth.users u where u.id = p.id);

delete from groups where slug = 'demo-screenshots';
